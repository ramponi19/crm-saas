/**
 * Lead scoring simples (Fase 6.2) — nota 0–100 por recência, origem, valor e
 * alcance. Função PURA (sem React/DB), calculável no card ou no servidor.
 * Cor é informação: quente = agir agora, morno = acompanhar, frio = esfriando.
 */

export interface LeadScoreInput {
  ultima_mensagem_at?: string | null
  created_at?: string | null
  origem?: string | null
  valor_estimado?: number | null
  telefone?: string | null
  instagram?: string | null
}

export type LeadTier = 'quente' | 'morno' | 'frio'
export interface LeadScore { score: number; tier: LeadTier }

// Origens mais "quentes" (contato direto/indicação) pontuam mais que passivas.
const ORIGEM_PESO: Record<string, number> = {
  indicacao: 20, whatsapp: 18, instagram: 15, messenger: 15, site: 10, manual: 8,
}

export function calcularScore(l: LeadScoreInput): LeadScore {
  let s = 0

  // Recência: quanto mais recente o último contato, mais quente.
  const ref = l.ultima_mensagem_at ?? l.created_at ?? null
  const dias = ref ? (Date.now() - new Date(ref).getTime()) / 86400000 : 999
  if (dias <= 1) s += 35
  else if (dias <= 3) s += 26
  else if (dias <= 7) s += 16
  else if (dias <= 14) s += 8

  // Origem do lead.
  s += ORIGEM_PESO[(l.origem ?? '').toLowerCase()] ?? 8

  // Valor estimado do negócio.
  const v = l.valor_estimado ?? 0
  if (v >= 5000) s += 25
  else if (v >= 1000) s += 16
  else if (v > 0) s += 8

  // Alcance (dá pra falar com o lead?).
  if (l.telefone) s += 8
  if (l.instagram) s += 4

  const score = Math.min(100, Math.round(s))
  const tier: LeadTier = score >= 65 ? 'quente' : score >= 35 ? 'morno' : 'frio'
  return { score, tier }
}

export const TIER_INFO: Record<LeadTier, { label: string; tone: 'acc' | 'warn' | 'neutro' }> = {
  quente: { label: 'Quente', tone: 'acc' },
  morno: { label: 'Morno', tone: 'warn' },
  frio: { label: 'Frio', tone: 'neutro' },
}
