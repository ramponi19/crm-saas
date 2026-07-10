/**
 * Lead scoring (Fase 6.2 → Sprint 2.3: configurável + engajamento).
 * Função PURA (sem React/DB), calculável no card ou no servidor. A config é
 * definida pelo dono (configuracoes_sistema.lead_scoring); sem config, usa os
 * pesos-padrão (retrocompatível). Cor é informação: quente = agir agora.
 */

export interface LeadScoreInput {
  ultima_mensagem_at?: string | null
  ultima_tratativa?: string | null
  created_at?: string | null
  origem?: string | null
  valor_estimado?: number | null
  telefone?: string | null
  instagram?: string | null
  // Engajamento (comportamento real):
  msgs_nao_lidas?: number | null
  primeira_msg?: string | null
  respondeu?: boolean
  contatos?: number
}

export type LeadTier = 'quente' | 'morno' | 'frio'
export interface LeadScore { score: number; tier: LeadTier }

export interface ScoreConfig {
  recencia: { ate_dias: number; pts: number }[]
  origem: Record<string, number>
  origem_padrao: number
  valor: { min: number; pts: number }[]
  alcance: { telefone: number; instagram: number }
  engajamento: { por_resposta: number; por_contato: number; max: number }
  limites: { quente: number; morno: number }
  gatilho: { ativo: boolean; score_min: number; cadencia_id: number | null }
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  recencia: [{ ate_dias: 1, pts: 35 }, { ate_dias: 3, pts: 26 }, { ate_dias: 7, pts: 16 }, { ate_dias: 14, pts: 8 }],
  origem: { indicacao: 20, whatsapp: 18, instagram: 15, messenger: 15, site: 10, manual: 8 },
  origem_padrao: 8,
  valor: [{ min: 5000, pts: 25 }, { min: 1000, pts: 16 }, { min: 1, pts: 8 }],
  alcance: { telefone: 8, instagram: 4 },
  engajamento: { por_resposta: 10, por_contato: 5, max: 25 },
  limites: { quente: 65, morno: 35 },
  gatilho: { ativo: false, score_min: 70, cadencia_id: null },
}

/** Mescla a config salva (parcial) sobre os padrões — nunca quebra por campo faltando. */
export function mergeScoreConfig(partial?: Partial<ScoreConfig> | null): ScoreConfig {
  if (!partial) return DEFAULT_SCORE_CONFIG
  return {
    recencia: partial.recencia?.length ? partial.recencia : DEFAULT_SCORE_CONFIG.recencia,
    origem: { ...DEFAULT_SCORE_CONFIG.origem, ...(partial.origem ?? {}) },
    origem_padrao: partial.origem_padrao ?? DEFAULT_SCORE_CONFIG.origem_padrao,
    valor: partial.valor?.length ? partial.valor : DEFAULT_SCORE_CONFIG.valor,
    alcance: { ...DEFAULT_SCORE_CONFIG.alcance, ...(partial.alcance ?? {}) },
    engajamento: { ...DEFAULT_SCORE_CONFIG.engajamento, ...(partial.engajamento ?? {}) },
    limites: { ...DEFAULT_SCORE_CONFIG.limites, ...(partial.limites ?? {}) },
    gatilho: { ...DEFAULT_SCORE_CONFIG.gatilho, ...(partial.gatilho ?? {}) },
  }
}

export function calcularScore(l: LeadScoreInput, cfg: ScoreConfig = DEFAULT_SCORE_CONFIG): LeadScore {
  let s = 0

  // Recência: quanto mais recente o último contato, mais quente.
  const ref = l.ultima_mensagem_at ?? l.ultima_tratativa ?? l.created_at ?? null
  const dias = ref ? (Date.now() - new Date(ref).getTime()) / 86400000 : 999
  const rb = [...cfg.recencia].sort((a, b) => a.ate_dias - b.ate_dias).find((b) => dias <= b.ate_dias)
  if (rb) s += rb.pts

  // Origem do lead.
  s += cfg.origem[(l.origem ?? '').toLowerCase()] ?? cfg.origem_padrao

  // Valor estimado do negócio.
  const v = l.valor_estimado ?? 0
  const vb = [...cfg.valor].sort((a, b) => b.min - a.min).find((b) => v >= b.min)
  if (vb) s += vb.pts

  // Alcance (dá pra falar com o lead?).
  if (l.telefone) s += cfg.alcance.telefone
  if (l.instagram) s += cfg.alcance.instagram

  // Engajamento (comportamento): respondeu + nº de contatos, limitado por max.
  const respondeu = l.respondeu ?? ((l.msgs_nao_lidas ?? 0) > 0 || !!l.primeira_msg)
  const contatos = l.contatos ?? 0
  const eng = Math.min(cfg.engajamento.max, (respondeu ? cfg.engajamento.por_resposta : 0) + contatos * cfg.engajamento.por_contato)
  s += eng

  const score = Math.min(100, Math.round(s))
  const tier: LeadTier = score >= cfg.limites.quente ? 'quente' : score >= cfg.limites.morno ? 'morno' : 'frio'
  return { score, tier }
}

export const TIER_INFO: Record<LeadTier, { label: string; tone: 'acc' | 'warn' | 'neutro' }> = {
  quente: { label: 'Quente', tone: 'acc' },
  morno: { label: 'Morno', tone: 'warn' },
  frio: { label: 'Frio', tone: 'neutro' },
}
