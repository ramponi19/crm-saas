'use client'

import { useState, useEffect } from 'react'
import { Plus, ArrowDownUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Button } from '@/components/ui'
import { TrocaModal, type UnidadeEstoque } from '@/components/modules/orcamentos/troca-modal'
import type { ValoresDoModelo } from '@/components/modules/orcamentos/avaliar-aparelho'
import { temHrefLiberado, HREF_COTACAO_TROCA } from '@/lib/menu'
import { camadasDoMenu } from '@/lib/empresa-config'
import { chaveLinha } from '@/lib/troca-modelos'

/**
 * OS BOTÕES DE ORÇAMENTO DE UMA LOJA DE CELULAR, no painel Orçamentos do card do lead (módulo
 * Celulares e aparelhos, `check_imei`; saiu do painel do core em 17/11/2026). Sem o módulo, o painel
 * (components/modules/orcamentos/lead-orcamento-panel.tsx) oferece "Venda" e "Conserto".
 *
 * `Venda / semi-novo` e `Downgrade` eram a MESMA operação (entra um aparelho do cliente, sai um do
 * estoque) partida em dois botões que pediam ao vendedor classificar o resultado ANTES de fazer a
 * conta. O botão único "Upgrade / Downgrade" só aparece onde a cotação de troca está liberada (a
 * camada do superadmin, HREF_COTACAO_TROCA); sem ela, os dois antigos continuam — tirar sem ter o
 * que pôr no lugar removeria a capacidade de orçar venda.
 */

/** Dados que só o modal de troca precisa — carregados no clique, não na abertura. */
interface DadosTroca {
  valores: Record<string, ValoresDoModelo>
  unidades: UnidadeEstoque[]
  bonusSeminovo: number
  corteBateria: number
}

export function BotoesOrcamentoCelular({ leadId, leadNome, leadTelefone, onNovo, onSalvo }: {
  leadId: number
  leadNome?: string | null
  leadTelefone?: string | null
  /** Abre o editor de orçamento do painel com este tipo. */
  onNovo: (tipo: string) => void
  /** Um orçamento foi salvo pelo modal de troca: o painel recarrega e o chat move a etapa. */
  onSalvo: () => void
}) {
  const [supabase] = useState(() => createClient())
  const [trocaLiberada, setTrocaLiberada] = useState<boolean | null>(null)
  const [dadosTroca, setDadosTroca] = useState<DadosTroca | null>(null)
  const [abrindoTroca, setAbrindoTroca] = useState(false)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      /**
       * ⚠️ A EMPRESA VEM DE `empresaAtualId`, NÃO de `limit(1)`: a política `superadmin_le_empresas`
       * deixa o superadmin ler TODAS, e o `limit(1)` trazia uma empresa qualquer — o botão de
       * Upgrade/Downgrade sumia na JM porque o menu lido era de outro tenant. `empresaAtualId` chama
       * `get_empresa_id()`, a mesma função que a RLS usa, e respeita a impersonação.
       */
      const empresaId = await empresaAtualId(supabase)
      const { data: emp } = empresaId
        ? await supabase.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle()
        : { data: null }
      if (!cancelado) setTrocaLiberada(temHrefLiberado(camadasDoMenu(emp?.itens).superadmin, HREF_COTACAO_TROCA))
    })()
    return () => { cancelado = true }
  }, [supabase])

  /**
   * A matriz, o estoque e as regras só são buscados AQUI, no clique. São três consultas e uma delas
   * traz o estoque disponível inteiro: pagá-las na abertura de todo card de lead — a tela mais
   * aberta do CRM — custaria em cada atendimento para servir a poucos.
   */
  async function abrirTroca() {
    setAbrindoTroca(true)
    const [{ data: precos }, { data: regras }, { data: unis }] = await Promise.all([
      supabase.from('avaliacao_precos').select('modelo, armazenamento, na_troca, descontos').eq('ativo', true),
      supabase.from('avaliacao_regras').select('bonus_seminovo, corte_bateria').maybeSingle(),
      supabase.from('estoque_unidades')
        .select('id, preco_venda, cor, armazenamento, condicao, produtos:estoque_produtos!produto_id(nome)')
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

  if (trocaLiberada === null) return null

  return (
    <>
      {trocaLiberada ? (
        <Button variant="outline" size="sm" loading={abrindoTroca}
          icon={<ArrowDownUp size={14} strokeWidth={1.7} />} onClick={abrirTroca}>
          Upgrade / Downgrade
        </Button>
      ) : (
        <>
          <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => onNovo('venda')}>Venda / semi-novo</Button>
          <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => onNovo('downgrade')}>Downgrade</Button>
        </>
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
          onSaved={onSalvo}
        />
      )}
    </>
  )
}
