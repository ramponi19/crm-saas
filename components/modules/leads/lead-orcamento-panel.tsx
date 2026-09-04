'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Receipt, Plus, Copy, Loader2, ArrowDownUp, Hash } from 'lucide-react'
import { Button, Badge, notify } from '@/components/ui'
import {
  OrcamentoEditorModal, orcamentoVazio, type EditorOrcamento,
} from '@/components/modules/orcamentos/orcamento-editor-modal'
import { TrocaModal, type UnidadeEstoque } from '@/components/modules/orcamentos/troca-modal'
import type { ValoresDoModelo } from '@/components/modules/orcamentos/avaliar-aparelho'
import { temHrefLiberado, HREF_COTACAO_TROCA, type MenuOverrideRow } from '@/lib/menu'
import { chaveLinha } from '@/lib/troca-modelos'

interface Orc {
  id: number; tipo: string; status: string; total: number; token: string
  valor_devolver: number
  /** Número da cotação de troca, quando o orçamento veio de uma. */
  numero_cotacao: number | null
}

const TIPO_LABEL: Record<string, string> = {
  assistencia: 'Conserto', melhoria: 'Upgrade', downgrade: 'Upgrade/Downgrade', venda: 'Venda',
}
const STATUS: Record<string, { l: string; t: 'neutro' | 'acc' | 'ok' | 'bad' }> = {
  rascunho: { l: 'Rascunho', t: 'neutro' }, enviado: { l: 'Enviado', t: 'acc' }, aprovado: { l: 'Aprovado', t: 'ok' }, recusado: { l: 'Recusado', t: 'bad' },
}
const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Dados que só o modal de troca precisa — carregados no clique, não na abertura. */
interface DadosTroca {
  valores: Record<string, ValoresDoModelo>
  unidades: UnidadeEstoque[]
  bonusSeminovo: number
  corteBateria: number
}

export function LeadOrcamentoPanel({ leadId, leadNome, leadTelefone, onSalvo }: {
  leadId: number
  leadNome?: string | null
  leadTelefone?: string | null
  /** Avisa o chat que um orçamento foi salvo — é o gancho que move a etapa. */
  onSalvo?: () => void
}) {
  const supabase = createClient()
  const [itens, setItens] = useState<Orc[]>([])
  const [carregou, setCarregou] = useState(false)
  const [editor, setEditor] = useState<EditorOrcamento | null>(null)
  const [trocaLiberada, setTrocaLiberada] = useState(false)
  const [dadosTroca, setDadosTroca] = useState<DadosTroca | null>(null)
  const [abrindoTroca, setAbrindoTroca] = useState(false)

  const carregar = useCallback(async () => {
    /**
     * O número da cotação vem por EMBED, não por segunda consulta.
     *
     * O vendedor precisa ler o código na lista para ditar no PDV. Buscar
     * cotação por cotação seria N+1 dentro de um modal que abre a cada lead.
     */
    /**
     * ⚠️ A EMPRESA VEM DE `empresaAtualId`, NÃO de `limit(1)`.
     *
     * Isto era `.from('empresas').select('menu_override').limit(1)`, contando
     * que a RLS devolvesse uma linha só. Para usuário comum devolve — mas a
     * política `superadmin_le_empresas` deixa o superadmin ler TODAS, e o
     * `limit(1)` então trazia uma empresa qualquer. O sintoma: o botão de
     * Upgrade/Downgrade não aparecia na JM porque o `menu_override` lido era de
     * outro tenant.
     *
     * `empresaAtualId` chama `get_empresa_id()` — a mesma função que a RLS usa,
     * e que respeita a impersonação. Contar com "a RLS vai filtrar" em vez de
     * dizer QUAL linha se quer é o erro; a RLS limita o que se pode ver, não
     * escolhe por você.
     */
    const empresaId = await empresaAtualId(supabase)
    const [{ data }, { data: emp }] = await Promise.all([
      supabase.from('orcamentos')
        .select('id, tipo, status, total, token, valor_devolver, troca_cotacoes!troca_cotacao_id(numero)')
        .eq('lead_id', leadId).order('created_at', { ascending: false }),
      empresaId
        ? supabase.from('empresas').select('menu_override').eq('id', empresaId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    type Linha = Omit<Orc, 'numero_cotacao'> & { troca_cotacoes: { numero: number | null } | { numero: number | null }[] | null }
    setItens(((data ?? []) as unknown as Linha[]).map((o) => {
      const c = Array.isArray(o.troca_cotacoes) ? o.troca_cotacoes[0] : o.troca_cotacoes
      return { ...o, total: Number(o.total) || 0, valor_devolver: Number(o.valor_devolver) || 0, numero_cotacao: c?.numero ?? null }
    }))
    setTrocaLiberada(temHrefLiberado((emp?.menu_override ?? null) as MenuOverrideRow | null, HREF_COTACAO_TROCA))
    setCarregou(true)
  }, [leadId, supabase])
  useEffect(() => { carregar() }, [carregar])

  /**
   * Abre o editor POR CIMA da conversa. Antes isto era
   * router.push('/orcamentos?...'): o atendente saía do chat no meio do
   * atendimento e não tinha caminho de volta para a conversa.
   */
  function novo(tipo: string) {
    setEditor({
      ...orcamentoVazio(tipo),
      cliente_nome: leadNome ?? '',
      cliente_telefone: leadTelefone ?? '',
      lead_id: leadId,
    })
  }

  /**
   * A matriz, o estoque e as regras só são buscados AQUI, no clique.
   *
   * São três consultas e uma delas traz o estoque disponível inteiro. Pagá-las
   * na abertura de todo modal de lead — que é a tela mais aberta do CRM —
   * custaria em cada atendimento para servir a poucos.
   */
  async function abrirTroca() {
    setAbrindoTroca(true)
    const [{ data: precos }, { data: regras }, { data: unis }] = await Promise.all([
      supabase.from('troca_precos').select('modelo, armazenamento, na_troca, descontos').eq('ativo', true),
      supabase.from('troca_regras').select('bonus_seminovo, corte_bateria').maybeSingle(),
      supabase.from('inventario_unidades')
        .select('id, preco_venda, cor, armazenamento, condicao, produtos!produto_id(nome)')
        .eq('status', 'disponivel').eq('ativo', true).limit(400),
    ])
    setAbrindoTroca(false)

    const valores: Record<string, ValoresDoModelo> = {}
    for (const p of precos ?? []) {
      valores[chaveLinha(p.modelo, p.armazenamento ?? '')] = {
        na_troca: p.na_troca == null ? null : Number(p.na_troca),
        descontos: (p.descontos ?? {}) as Record<string, number>,
      }
    }

    type Uni = { id: number; preco_venda: number | null; cor: string | null; armazenamento: string | null; condicao: string | null; produtos: { nome: string | null } | { nome: string | null }[] | null }
    const unidades: UnidadeEstoque[] = ((unis ?? []) as unknown as Uni[]).map((u) => {
      const prod = Array.isArray(u.produtos) ? u.produtos[0] : u.produtos
      return {
        id: u.id,
        label: [prod?.nome, u.armazenamento, u.cor, u.condicao ? `(${u.condicao})` : null].filter(Boolean).join(' ') || 'Aparelho',
        preco: Number(u.preco_venda) || 0,
      }
    })

    setDadosTroca({
      valores, unidades,
      bonusSeminovo: Number(regras?.bonus_seminovo) || 0,
      corteBateria: regras?.corte_bateria ?? 80,
    })
  }

  function copiar(o: Orc) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    navigator.clipboard?.writeText(`${base}/orcamento/${o.token}`); notify.ok('Link copiado')
  }

  if (!carregou) return <div className="border-t border-line-soft pt-4 mt-1 p-1 text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="animate-spin inline mr-2" />Carregando orçamentos…</div>

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="mb-3 flex items-center gap-2">
        <Receipt size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Orçamentos</span>
      </div>

      {itens.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {itens.map((o) => {
            const st = STATUS[o.status] ?? STATUS.rascunho
            return (
              <div key={o.id} className="flex items-center gap-2 rounded-control border border-line p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-medium text-ink">{TIPO_LABEL[o.tipo] ?? o.tipo}</span>
                    <Badge tone={st.t}>{st.l}</Badge>
                    {/* O CÓDIGO NA LISTA. É daqui que o vendedor lê o número
                        para digitar no PDV — sem ele, teria que abrir o
                        orçamento para descobrir. */}
                    {o.numero_cotacao != null && (
                      <span className="inline-flex items-center gap-1 rounded-[6px] bg-accent-soft px-1.5 py-[2px] text-[10.5px] font-bold tabular-nums text-accent">
                        <Hash size={10} strokeWidth={2.4} />{o.numero_cotacao}
                      </span>
                    )}
                  </div>
                  {/* Downgrade tem saldo a favor do cliente: mostrar `total`
                      (zero) esconderia o valor que a loja deve. */}
                  <div className="num text-[11.5px] text-ink-3">
                    {o.valor_devolver > 0 ? `a devolver ${brl(o.valor_devolver)}` : brl(o.total)}
                  </div>
                </div>
                <button type="button" onClick={() => copiar(o)} className="shrink-0 text-ink-3 hover:text-ink" aria-label="Copiar link"><Copy size={13} strokeWidth={1.7} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/**
          * `Venda / semi-novo` e `Downgrade` saíram: era a MESMA operação (entra
          * um aparelho do cliente, sai um do estoque) partida em dois botões que
          * pediam ao vendedor classificar o resultado ANTES de fazer a conta.
          *
          * O botão único só aparece onde a cotação está liberada. Nos tenants sem
          * o módulo, os dois antigos continuam — tirar sem ter o que pôr no lugar
          * removeria a capacidade de orçar venda deles.
          */}
        {trocaLiberada ? (
          <Button variant="outline" size="sm" loading={abrindoTroca}
            icon={<ArrowDownUp size={14} strokeWidth={1.7} />} onClick={abrirTroca}>
            Upgrade / Downgrade
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => novo('venda')}>Venda / semi-novo</Button>
            <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => novo('downgrade')}>Downgrade</Button>
          </>
        )}
        <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => novo('assistencia')}>Conserto</Button>
      </div>

      {editor && (
        <OrcamentoEditorModal
          inicial={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { carregar(); onSalvo?.() }}
        />
      )}

      {dadosTroca && (
        <TrocaModal
          valores={dadosTroca.valores}
          unidades={dadosTroca.unidades}
          bonusSeminovo={dadosTroca.bonusSeminovo}
          corteBateria={dadosTroca.corteBateria}
          leadId={leadId}
          clienteInicial={{ nome: leadNome ?? '', telefone: leadTelefone ?? '', cliente_id: null }}
          onClose={() => setDadosTroca(null)}
          onSaved={() => { carregar(); onSalvo?.() }}
        />
      )}
    </div>
  )
}
