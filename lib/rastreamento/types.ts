// Tipos do módulo Rastreamento (atribuição de anúncio → WhatsApp → venda → CAPI).
// Espelham as tabelas rastreamento_* criadas na migration rastreamento_core_tables.

export interface RastreamentoConfig {
  empresa_id: number
  public_token: string
  meta_pixel_id: string | null
  capi_token_enc: string | null
  capi_ativo: boolean
  capi_test_code: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface RastreamentoLink {
  id: number
  empresa_id: number
  slug: string
  titulo: string | null
  destino_url: string
  wa_numero: string | null
  wa_texto: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  cliques: number
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface RastreamentoVisita {
  id: number
  empresa_id: number
  tracking_id: string
  visitor_code: string | null
  link_id: number | null
  lead_id: number | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  ta_cod: string | null
  referrer: string | null
  page_url: string | null
  ip: string | null
  user_agent: string | null
  fbp: string | null
  fbc: string | null
  criado_em: string
}

export type RastreamentoEventoTipo = 'pageview' | 'lead' | 'purchase'
export type CapiStatus = 'pendente' | 'enviado' | 'erro' | 'desativado'

export interface RastreamentoEvento {
  id: number
  empresa_id: number
  visita_id: number | null
  lead_id: number | null
  tipo: RastreamentoEventoTipo
  event_id: string | null
  order_id: string | null
  valor: number | null
  moeda: string
  produto: string | null
  contato_email: string | null
  contato_fone: string | null
  capi_status: CapiStatus
  capi_response: unknown | null
  criado_em: string
}

/** Campos de atribuição capturados pelo pixel na URL/cookies. */
export interface Atribuicao {
  tracking_id?: string | null
  link_id?: number | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  fbclid?: string | null
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  ta_cod?: string | null
  referrer?: string | null
  page_url?: string | null
  fbp?: string | null
  fbc?: string | null
}
