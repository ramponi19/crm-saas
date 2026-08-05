import { NextResponse, type NextRequest } from 'next/server'
import { rastrDb } from '@/lib/rastreamento/db'
import { enviarCapi } from '@/lib/rastreamento/capi'

/**
 * Compra na página de obrigado (endpoint público, sem auth).
 *
 * Registra o evento Purchase, tenta reencontrar a visita pelo tracking_id para
 * herdar fbclid/fbc/UTM, e dispara o evento para a Conversions API da Meta.
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function OPTIONS() {
  return new NextResponse(null, { headers: cors })
}
function json(obj: unknown, status = 200) {
  return NextResponse.json(obj, { status, headers: cors })
}

interface VisitaOrigem {
  id: number
  lead_id: number | null
  fbc: string | null
  fbp: string | null
  fbclid: string | null
  page_url: string | null
  ip: string | null
  user_agent: string | null
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ ok: false, error: 'json_invalido' }, 400) }

  const companyToken = String(body.company_token ?? '').trim()
  if (!companyToken) return json({ ok: false, error: 'company_token_obrigatorio' }, 400)

  const email = String(body.email ?? '').trim() || null
  const phone = String(body.phone ?? '').trim() || null
  if (!email && !phone) return json({ ok: false, error: 'phone_or_email_required' }, 400)

  const db = rastrDb()
  const { data: cfg } = await db.from('rastreamento_config')
    .select('empresa_id, ativo, meta_pixel_id, capi_token_enc, capi_ativo, capi_test_code')
    .eq('public_token', companyToken).maybeSingle()
  if (!cfg || cfg.ativo === false) return json({ ok: false, error: 'token_invalido' }, 404)

  const empresaId = cfg.empresa_id as number

  // Visita de origem (herda fbclid/fbc/UTM/página) via tracking_id do cookie.
  const trackingId = String(body.tracking_id ?? '').trim() || null
  let visita: VisitaOrigem | null = null
  if (trackingId) {
    const { data } = await db.from('rastreamento_visitas')
      .select('id, lead_id, fbc, fbp, fbclid, page_url, ip, user_agent')
      .eq('empresa_id', empresaId).eq('tracking_id', trackingId).maybeSingle()
    visita = (data as VisitaOrigem | null) ?? null
  }

  const valor = typeof body.value === 'number' ? (body.value as number) : null
  const eventId = String(body.event_id ?? '').trim()
    || `pur_${empresaId}_${(body.order_id ?? Math.floor(Date.now() / 1000)).toString()}`

  // Grava o evento antes do CAPI (não perder a venda se a Meta falhar).
  const { data: ev } = await db.from('rastreamento_eventos').insert({
    empresa_id: empresaId, visita_id: visita?.id ?? null, lead_id: visita?.lead_id ?? null,
    tipo: 'purchase', event_id: eventId, order_id: String(body.order_id ?? '') || null,
    valor, moeda: String(body.currency ?? 'BRL'), produto: String(body.product_name ?? '') || null,
    contato_email: email, contato_fone: phone, capi_status: 'pendente',
  }).select('id').single()

  const capi = await enviarCapi(cfg, {
    eventName: 'Purchase', eventId, valor, moeda: String(body.currency ?? 'BRL'),
    email, telefone: phone,
    visita: visita ? { fbc: visita.fbc, fbp: visita.fbp, fbclid: visita.fbclid, page_url: visita.page_url, ip: visita.ip, user_agent: visita.user_agent } : null,
  })

  const status = capi.desativado ? 'desativado' : (capi.ok ? 'enviado' : 'erro')
  if (ev?.id) {
    await db.from('rastreamento_eventos')
      .update({ capi_status: status, capi_response: capi.body }).eq('id', ev.id as number)
  }

  return json({ ok: true, capi: status })
}
