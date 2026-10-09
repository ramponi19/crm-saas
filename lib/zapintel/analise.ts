import { carregarConversas, idDoLead, type LeadBanco } from '@/lib/zapintel/conversas'
import type { Lead } from '@/types/zapintel'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * O CÁLCULO DA ANÁLISE DO ZAPINTEL, do lado do servidor.
 *
 * ══ POR QUE AQUI E NÃO NO NAVEGADOR ════════════════════════════════════════
 *
 * O ZapIntel existe para ler TODAS as conversas. Mandá-las para o navegador
 * batia em 4,5 MB de resposta e 10 s de função, e a saída anterior — cortar em
 * 40.000 mensagens ordenadas da mais antiga para a mais nova — fazia a análise
 * parar em 23/09 e ignorar 17 mil mensagens.
 *
 * Medido em 09/10/2026: o motor lê 54.888 mensagens em 0,5 s; buscá-las em
 * ondas paralelas leva 1,3 s. Processar é barato, transportar é caro — então o
 * cálculo veio para perto do dado e só a conclusão viaja. A leitura em si mora
 * em `lib/zapintel/conversas.ts`.
 *
 * ══ AS DUAS ENTRADAS ═══════════════════════════════════════════════════════
 *
 * `analisarLeads` recebe os ids e devolve o que gravar. Serve ao cálculo
 * completo (na primeira carga) e ao incremental (um lead, quando chega
 * mensagem). É o MESMO caminho nos dois casos: dois caminhos dariam dois
 * resultados diferentes para o mesmo lead, e ninguém saberia qual acreditar.
 */

export interface LinhaAnalise {
  lead_id: number
  empresa_id: number
  filial_id: number | null
  classificacao: string | null
  score: number | null
  perfil: string | null
  urgencia: string | null
  dias_inativo: number | null
  dias_conversa: number | null
  primeira_em: string | null
  ultima_em: string | null
  total_mensagens: number | null
  mensagens_lead: number | null
  mensagens_loja: number | null
  sinais_compra: string[]
  objecoes: unknown[]
  proxima_acao: string | null
  insight: string | null
  risco_perda: number | null
  vendedor: string | null
  canal: string | null
  calculado_em: string
}

/** O lead analisado vira a linha da tabela. Um lugar só, para os dois caminhos. */
export function montarLinha(a: Lead, lead: LeadBanco, empresaId: number, agora: string): LinhaAnalise {
  return {
    lead_id: lead.id,
    empresa_id: empresaId,
    filial_id: lead.filial_id,
    classificacao: a.classification ?? null,
    score: a.score ?? null,
    perfil: a.buyerProfile ?? null,
    urgencia: a.urgency ?? null,
    dias_inativo: a.daysInactive ?? null,
    dias_conversa: a.conversationDays ?? null,
    primeira_em: a.firstDate || null,
    ultima_em: a.lastDate || null,
    total_mensagens: a.totalMessages ?? null,
    mensagens_lead: a.leadMessages ?? null,
    mensagens_loja: a.storeMessages ?? null,
    sinais_compra: a.buySignals ?? [],
    objecoes: a.objections ?? [],
    proxima_acao: a.nextAction ?? null,
    insight: a.insight ?? null,
    risco_perda: a.lossRisk ?? null,
    vendedor: a.sellerName ?? null,
    canal: lead.origem ?? null,
    calculado_em: agora,
  }
}

/**
 * Lead ATIVO SEM conversa também vira linha, zerado.
 *
 * Sem isto ele simplesmente não apareceria no ZapIntel — e lead sem nenhuma
 * mensagem é informação, não ausência dela: é alguém que entrou no funil e
 * nunca foi atendido.
 */
export function linhaVazia(lead: LeadBanco, empresaId: number, agora: string): LinhaAnalise {
  return {
    lead_id: lead.id, empresa_id: empresaId, filial_id: lead.filial_id,
    classificacao: null, score: 0, perfil: null, urgencia: 'low',
    dias_inativo: null, dias_conversa: 0, primeira_em: null, ultima_em: null,
    total_mensagens: 0, mensagens_lead: 0, mensagens_loja: 0,
    sinais_compra: [], objecoes: [],
    proxima_acao: 'Sem conversa — primeiro contato pendente', insight: null,
    risco_perda: null, vendedor: null, canal: lead.origem ?? null,
    calculado_em: agora,
  }
}

/** Converte o resultado do motor nas linhas da tabela. */
export function linhasDaAnalise(
  analisados: Lead[],
  porId: Map<number, LeadBanco>,
  empresaId: number,
): LinhaAnalise[] {
  const agora = new Date().toISOString()
  const linhas: LinhaAnalise[] = []

  for (const a of analisados) {
    const id = idDoLead(a)
    const lead = id != null ? porId.get(id) : undefined
    if (lead) linhas.push(montarLinha(a, lead, empresaId, agora))
  }

  const comAnalise = new Set(linhas.map((l) => l.lead_id))
  for (const lead of porId.values()) {
    if (!comAnalise.has(lead.id)) linhas.push(linhaVazia(lead, empresaId, agora))
  }

  return linhas
}

/**
 * Analisa os leads pedidos e devolve as linhas prontas para gravar.
 *
 * `ids` vazio significa a empresa inteira.
 */
export async function analisarLeads(
  db: SupabaseClient,
  empresaId: number,
  ids: number[] = [],
): Promise<LinhaAnalise[]> {
  const { analisados, porId } = await carregarConversas(db, empresaId, ids)
  if (!porId.size) return []
  return linhasDaAnalise(analisados, porId, empresaId)
}

/** Grava o resultado. `upsert` porque recalcular é o caso normal, não exceção. */
export async function gravarAnalise(db: SupabaseClient, linhas: LinhaAnalise[]): Promise<number> {
  if (!linhas.length) return 0
  let gravadas = 0
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500)
    const { error } = await db.from('zapintel_analise').upsert(lote, { onConflict: 'lead_id' })
    if (error) throw new Error(error.message)
    gravadas += lote.length
  }
  return gravadas
}
