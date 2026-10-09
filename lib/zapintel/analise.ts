import { parseCombinedCSV } from '@/lib/zapintel/parser/csvParser'
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
 * Medido em 09/10/2026: o motor lê 50.863 mensagens em 507 ms; transportá-las
 * leva 12,7 s. Processar é barato, transportar é caro — então o cálculo veio
 * para perto do dado e só a conclusão viaja.
 *
 * ══ AS DUAS ENTRADAS ═══════════════════════════════════════════════════════
 *
 * `analisarLeads` recebe os ids e devolve o que gravar. Serve ao cálculo
 * completo (em lotes, na primeira carga) e ao incremental (um lead, quando
 * chega mensagem — ~120 ms). É o MESMO caminho nos dois casos: dois caminhos
 * dariam dois resultados diferentes para o mesmo lead, e ninguém saberia qual
 * acreditar.
 */

/** Precisa bater com STORE_PHONE do parser — é assim que ele reconhece a loja. */
const STORE_PHONE = '5519998862028'
const HEADER = 'Contato;Arquivo;Date1;Date2;Time;UserPhone;UserName;MessageBody;MediaType;MediaLink;MediaCaption;QuotedMessage;QuotedUserName;QuotedMessageDate;QuotedMessageTime'

const limpa = (s: string) => (s || '').replace(/[\r\n;]+/g, ' ').trim()

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

type MsgBanco = {
  lead_id: number
  direcao: string
  conteudo: string | null
  tipo: string | null
  created_at: string
}

type LeadBanco = {
  id: number
  nome: string | null
  telefone: string | null
  origem_id: string | null
  origem: string | null
  filial_id: number | null
  empresa_id: number
}

/**
 * O PostgREST corta em 1000 linhas — inclusive em FUNÇÃO.
 *
 * Descoberto ao medir: uma RPC que seleciona certo no banco ainda volta cortada
 * pela API. Por isso a paginação continua, agora sobre um recorte pequeno (as
 * conversas de um lote de leads), e não sobre a empresa inteira.
 */
async function buscarTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000
  const fora: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1)
    if (error) throw new Error((error as { message?: string }).message ?? 'falha ao ler')
    const lote = (data ?? []) as T[]
    fora.push(...lote)
    if (lote.length < PAGINA) break
  }
  return fora
}

/** Monta o CSV que o parser entende, a partir das linhas do banco. */
function montarCsv(leads: Map<number, LeadBanco>, msgs: MsgBanco[], nomeDaLoja: string): string {
  const linhas = [HEADER]
  for (const m of msgs) {
    const lead = leads.get(m.lead_id)
    if (!lead) continue
    const contato = limpa(lead.nome || lead.telefone || lead.origem_id || `Lead ${m.lead_id}`)
    const dt = new Date(m.created_at)
    const dia = m.created_at.slice(0, 10)
    const hora = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    const enviada = m.direcao === 'enviada'
    linhas.push([
      contato,
      `lead-${m.lead_id}`,
      dia, dia, hora,
      enviada ? STORE_PHONE : limpa(lead.telefone || lead.origem_id || String(m.lead_id)),
      enviada ? nomeDaLoja : contato,
      limpa(m.conteudo || ''),
      m.tipo && m.tipo !== 'texto' ? m.tipo : '',
      '', '', '', '', '', '',
    ].join(';'))
  }
  return linhas.join('\n')
}

/** O id do lead vem do campo `filename` (`lead-123`), que o parser preserva. */
const idDoLead = (lead: Lead): number | null => {
  const m = /^lead-(\d+)$/.exec(lead.filename ?? '')
  return m ? Number(m[1]) : null
}

/**
 * Analisa os leads pedidos e devolve as linhas prontas para gravar.
 *
 * `ids` vazio significa a empresa inteira — use só no cálculo completo, e em
 * lotes: 2.039 leads de uma vez levam 13 s, acima do limite de função.
 */
export async function analisarLeads(
  db: SupabaseClient,
  empresaId: number,
  ids: number[] = [],
): Promise<LinhaAnalise[]> {
  const { data: empresa } = await db.from('empresas').select('nome').eq('id', empresaId).maybeSingle()
  const nomeDaLoja = limpa((empresa?.nome as string) || 'Loja') || 'Loja'

  const leadsRaw = await buscarTudo<LeadBanco>((de, ate) => {
    let q = db.from('leads')
      .select('id, nome, telefone, origem_id, origem, filial_id, empresa_id')
      .eq('empresa_id', empresaId).eq('ativo', true)
    if (ids.length) q = q.in('id', ids)
    return q.order('id', { ascending: true }).range(de, ate)
  })

  if (!leadsRaw.length) return []

  const porId = new Map(leadsRaw.map((l) => [l.id, l]))
  const alvo = [...porId.keys()]

  const msgs = await buscarTudo<MsgBanco>((de, ate) =>
    db.from('lead_mensagens')
      .select('lead_id, direcao, conteudo, tipo, created_at')
      .eq('empresa_id', empresaId)
      .in('lead_id', alvo)
      .order('created_at', { ascending: true })
      .range(de, ate))

  const analisados = parseCombinedCSV(montarCsv(porId, msgs, nomeDaLoja))
  const agora = new Date().toISOString()

  const linhas: LinhaAnalise[] = []
  for (const a of analisados) {
    const id = idDoLead(a)
    const lead = id != null ? porId.get(id) : undefined
    if (!lead) continue
    linhas.push({
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
    })
  }

  /**
   * Lead ATIVO SEM conversa também entra, zerado.
   *
   * Sem isto ele simplesmente não apareceria no ZapIntel — e lead sem nenhuma
   * mensagem é informação, não ausência dela: é alguém que entrou no funil e
   * nunca foi atendido.
   */
  const comAnalise = new Set(linhas.map((l) => l.lead_id))
  for (const lead of leadsRaw) {
    if (comAnalise.has(lead.id)) continue
    linhas.push({
      lead_id: lead.id, empresa_id: empresaId, filial_id: lead.filial_id,
      classificacao: null, score: 0, perfil: null, urgencia: 'low',
      dias_inativo: null, dias_conversa: 0, primeira_em: null, ultima_em: null,
      total_mensagens: 0, mensagens_lead: 0, mensagens_loja: 0,
      sinais_compra: [], objecoes: [],
      proxima_acao: 'Sem conversa — primeiro contato pendente', insight: null,
      risco_perda: null, vendedor: null, canal: lead.origem ?? null,
      calculado_em: agora,
    })
  }

  return linhas
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
