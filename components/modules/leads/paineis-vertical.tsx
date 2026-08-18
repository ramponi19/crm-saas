'use client'

import type { PainelDoLead } from '@/lib/segmentos'
import { LeadMatchPanel } from './lead-match-panel'
import { LeadInteressePanel } from './lead-interesse-panel'
import { LeadFinanciamentoPanel } from './lead-financiamento-panel'

/**
 * Painéis de vertical do modal do lead, por nome.
 *
 * ══ POR QUE ESTE ARQUIVO EXISTE ════════════════════════════════════════════
 *
 * O modal do lead tinha uma linha por painel, cada uma comparando o segmento com
 * o nome da vertical ("se for imobiliária, mostre o match; se for concessionária,
 * mostre interesse e financiamento").
 *
 * Consequência prática: acrescentar uma vertical exigia EDITAR o modal do lead —
 * o arquivo mais disputado do projeto, onde duas frentes já colidiram em 13/08.
 *
 * Agora o segmento declara em `paineisDoLead` (lib/segmentos.ts) quais quer, e
 * este mapa liga nome → componente. Uma vertical nova acrescenta um nome na
 * config; o modal não muda. Um painel novo entra aqui; o modal também não muda.
 *
 * Os três painéis recebem só `leadId`, então isto é ligação, não reescrita — o
 * comportamento é idêntico ao dos `if` que existiam antes.
 */
export const PAINEIS_DO_LEAD: Record<PainelDoLead, (props: { leadId: number }) => React.ReactNode> = {
  'match-imoveis': ({ leadId }) => <LeadMatchPanel leadId={leadId} />,
  'interesse-veiculo': ({ leadId }) => <LeadInteressePanel leadId={leadId} />,
  'financiamento': ({ leadId }) => <LeadFinanciamentoPanel leadId={leadId} />,
}

/**
 * Renderiza os painéis do segmento, na ordem declarada.
 *
 * Nome desconhecido é IGNORADO em silêncio de propósito: o tipo `PainelDoLead` já
 * impede o erro em tempo de compilação, e um painel a menos não pode derrubar a
 * conversa inteira de um cliente.
 */
export function PaineisDaVertical({ nomes, leadId }: { nomes: PainelDoLead[]; leadId: number }) {
  return (
    <>
      {nomes.map((nome) => {
        const Painel = PAINEIS_DO_LEAD[nome]
        return Painel ? <Painel key={nome} leadId={leadId} /> : null
      })}
    </>
  )
}
