import crypto from 'crypto'
import { decifrarToken } from '@/lib/canais/crypto'
import type { RastreamentoConfig, RastreamentoVisita } from './types'

/**
 * Meta Conversions API (CAPI) — envio server-side de eventos de conversão.
 *
 * Fecha o loop que o Pixel do navegador não fecha: o clique sai para o WhatsApp
 * sem passar por servidor da Meta, então a venda precisa ser reportada por aqui,
 * com o `fbclid`/`fbc` da visita original para a Meta reconciliar com o anúncio.
 *
 * Dados de contato (email/telefone) vão SEMPRE hasheados em SHA-256, como a Meta
 * exige. `event_id` casa com o do Pixel para deduplicar.
 */

const GRAPH = process.env.META_GRAPH_VERSION ?? 'v25.0'

function sha256(v: string): string {
  return crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex')
}

/** Normaliza telefone para E.164 sem símbolos (só dígitos) antes do hash. */
function normFone(fone: string): string {
  const d = fone.replace(/\D/g, '')
  return d.startsWith('55') ? d : (d.length >= 10 ? '55' + d : d)
}

export interface CapiEventInput {
  eventName: 'Lead' | 'Purchase'
  eventId: string
  eventTime?: number // epoch segundos; default agora
  valor?: number | null
  moeda?: string
  email?: string | null
  telefone?: string | null
  visita?: Pick<RastreamentoVisita, 'fbc' | 'fbp' | 'fbclid' | 'page_url' | 'ip' | 'user_agent'> | null
}

export interface CapiResultado {
  ok: boolean
  status: number
  body: unknown
}

/**
 * Envia um evento à Conversions API usando a config da empresa.
 * Retorna { ok:false } sem lançar quando CAPI está desativada ou sem token —
 * o chamador grava o status apropriado no evento.
 */
export async function enviarCapi(
  config: Pick<RastreamentoConfig, 'meta_pixel_id' | 'capi_token_enc' | 'capi_ativo' | 'capi_test_code'>,
  ev: CapiEventInput,
): Promise<CapiResultado & { desativado?: boolean }> {
  if (!config.capi_ativo || !config.meta_pixel_id || !config.capi_token_enc) {
    return { ok: false, status: 0, body: null, desativado: true }
  }

  let token: string
  try {
    token = decifrarToken(config.capi_token_enc)
  } catch {
    return { ok: false, status: 0, body: { error: 'capi_token_invalido' } }
  }

  const fbc = ev.visita?.fbc
    || (ev.visita?.fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${ev.visita.fbclid}` : undefined)

  const userData: Record<string, unknown> = {}
  if (ev.email) userData.em = [sha256(ev.email)]
  if (ev.telefone) userData.ph = [sha256(normFone(ev.telefone))]
  if (fbc) userData.fbc = fbc
  if (ev.visita?.fbp) userData.fbp = ev.visita.fbp
  if (ev.visita?.ip) userData.client_ip_address = ev.visita.ip
  if (ev.visita?.user_agent) userData.client_user_agent = ev.visita.user_agent

  const evento: Record<string, unknown> = {
    event_name: ev.eventName,
    event_time: ev.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: ev.eventId,
    action_source: 'website',
    event_source_url: ev.visita?.page_url ?? undefined,
    user_data: userData,
  }
  if (ev.eventName === 'Purchase' || ev.valor != null) {
    evento.custom_data = { value: ev.valor ?? 0, currency: ev.moeda ?? 'BRL' }
  }

  const payload: Record<string, unknown> = { data: [evento] }
  if (config.capi_test_code) payload.test_event_code = config.capi_test_code

  try {
    const r = await fetch(
      `https://graph.facebook.com/${GRAPH}/${config.meta_pixel_id}/events?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    )
    const body = await r.json().catch(() => null)
    return { ok: r.ok, status: r.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: { error: (e as Error).message } }
  }
}
