import { NextResponse, type NextRequest } from 'next/server'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * PageView do pixel (endpoint público, sem auth — chamado da LP do cliente).
 *
 * Resolve a empresa pelo company_token, cria/atualiza a visita e devolve o
 * tracking_id para o pixel gravar no cookie. Idempotente por tracking_id.
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

function ip(req: NextRequest): string | null {
  const xf = req.headers.get('x-forwarded-for')
  return xf ? xf.split(',')[0].trim() : (req.headers.get('x-real-ip') || null)
}

function codeFrom(trackingId: string): string {
  return trackingId.replace(/-/g, '').toLowerCase().slice(0, 8)
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'json_invalido' }, 400) }

  const companyToken = String(body.company_token ?? '').trim()
  if (!companyToken) return json({ error: 'company_token_obrigatorio' }, 400)

  const db = rastrDb()
  const { data: cfg } = await db.from('rastreamento_config')
    .select('empresa_id, ativo').eq('public_token', companyToken).maybeSingle()
  if (!cfg || cfg.ativo === false) return json({ error: 'token_invalido' }, 404)

  const empresaId = cfg.empresa_id as number
  const str = (k: string) => { const v = body[k]; return v == null || v === '' ? null : String(v).slice(0, 500) }

  // link_id pode vir como slug (data-link) — resolve para o id numérico.
  let linkId: number | null = null
  const rawLink = str('link_id')
  if (rawLink) {
    if (/^\d+$/.test(rawLink)) {
      const { data } = await db.from('rastreamento_links')
        .select('id').eq('empresa_id', empresaId).eq('id', Number(rawLink)).maybeSingle()
      linkId = (data?.id as number) ?? null
    } else {
      const { data } = await db.from('rastreamento_links')
        .select('id').eq('empresa_id', empresaId).eq('slug', rawLink).maybeSingle()
      linkId = (data?.id as number) ?? null
    }
  }

  const fbclid = str('fbclid')
  const fbc = fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}` : null

  const existingTid = str('tracking_id')
  const campos = {
    empresa_id: empresaId,
    link_id: linkId,
    utm_source: str('utm_source'), utm_medium: str('utm_medium'), utm_campaign: str('utm_campaign'),
    utm_content: str('utm_content'), utm_term: str('utm_term'),
    fbclid, gclid: str('gclid'), gbraid: str('gbraid'), wbraid: str('wbraid'), ta_cod: str('ta_cod'),
    referrer: str('referrer'), page_url: str('page_url'),
    ip: ip(req), user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
    fbp: str('fbp'), fbc,
  }

  // Visita já existente (tracking_id do cookie): atualiza e mantém o mesmo id.
  if (existingTid) {
    const { data: v } = await db.from('rastreamento_visitas')
      .select('id, tracking_id').eq('empresa_id', empresaId).eq('tracking_id', existingTid).maybeSingle()
    if (v) {
      await db.from('rastreamento_visitas').update(campos).eq('id', v.id as number)
      return json({ tracking_id: v.tracking_id })
    }
  }

  const { data: nova, error } = await db.from('rastreamento_visitas')
    .insert(campos).select('id, tracking_id').single()
  if (error || !nova) return json({ error: 'falha_ao_registrar' }, 500)

  const trackingId = nova.tracking_id as string
  await db.from('rastreamento_visitas')
    .update({ visitor_code: codeFrom(trackingId) }).eq('id', nova.id as number)

  // Evento pageview (os cliques por link são derivados das visitas por link_id).
  await db.from('rastreamento_eventos').insert({
    empresa_id: empresaId, visita_id: nova.id as number, tipo: 'pageview', capi_status: 'desativado',
  })

  return json({ tracking_id: trackingId })
}
