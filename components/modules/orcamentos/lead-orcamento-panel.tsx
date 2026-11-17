'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Receipt, Plus, Copy, Loader2, Hash } from 'lucide-react'
import { Button, Badge, notify } from '@/components/ui'
import {
  OrcamentoEditorModal, orcamentoVazio, type EditorOrcamento,
} from '@/components/modules/orcamentos/orcamento-editor-modal'
import { useModuloLigado } from '@/components/layout/ferramentas-context'
import { BotoesOrcamentoCelular } from '@/components/modules/celulares/card-orcamento-troca'

/**
 * Painel Orçamentos do card do lead — do módulo Orçamentos (core/modulos.ts → paineisDoLead
 * 'orcamento'): o card só o mostra com o módulo ligado. Os botões de troca de aparelho
 * (Upgrade/Downgrade, Venda de seminovo) são do módulo Celulares e aparelhos.
 */

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
  const celular = !!useModuloLigado('/check-imei')

  const carregar = useCallback(async () => {
    /**
     * O número da cotação vem por EMBED, não por segunda consulta.
     *
     * O vendedor precisa ler o código na lista para ditar no PDV. Buscar
     * cotação por cotação seria N+1 dentro de um modal que abre a cada lead.
     */
    const { data } = await supabase.from('orcamentos_orcamentos')
      // O embed é nomeado pela CONSTRAINT. O hint pela coluna
      // (`!troca_cotacao_id`) também resolve — medido nos dois —, mas o nome da
      // constraint é único por definição, então não passa a ambíguo no dia em
      // que aparecer uma segunda FK entre as mesmas tabelas.
      //
      // Hint que o PostgREST não resolve falha ALTO, com PGRST200 ("no matches
      // were found"), não em silêncio — conferido com um hint inventado.
      .select('id, tipo, status, total, token, valor_devolver, troca_cotacoes:celulares_troca_cotacoes!orcamentos_troca_cotacao_id_fkey(numero)')
      .eq('lead_id', leadId).order('created_at', { ascending: false })

    type Linha = Omit<Orc, 'numero_cotacao'> & { troca_cotacoes: { numero: number | null } | { numero: number | null }[] | null }
    setItens(((data ?? []) as unknown as Linha[]).map((o) => {
      const c = Array.isArray(o.troca_cotacoes) ? o.troca_cotacoes[0] : o.troca_cotacoes
      return { ...o, total: Number(o.total) || 0, valor_devolver: Number(o.valor_devolver) || 0, numero_cotacao: c?.numero ?? null }
    }))
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
        {/* Troca de aparelho e venda de seminovo: do módulo Celulares e aparelhos. Sem ele, a venda
            comum — entra no orçamento o item, e o do estoque baixa ao aprovar. */}
        {celular ? (
          <BotoesOrcamentoCelular leadId={leadId} leadNome={leadNome} leadTelefone={leadTelefone}
            onNovo={novo} onSalvo={() => { carregar(); onSalvo?.() }} />
        ) : (
          <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => novo('venda')}>Venda</Button>
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
    </div>
  )
}
