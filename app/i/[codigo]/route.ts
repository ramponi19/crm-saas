import { NextResponse, type NextRequest } from 'next/server'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Link rastreável público: /i/<id-do-link>
 *
 * Redireciona para o destino (wa.me ou LP) registrando a visita no caminho — e,
 * quando o destino é WhatsApp com ?text=, carimba ` [@<código>]` na mensagem
 * para o webhook reencontrar a visita e colar a campanha no lead. Assim o
 * rastreamento de WhatsApp funciona SEM o cliente instalar pixel na página.
 */
export const dynamic = 'force-dynamic'

function ip(req: NextRequest): string | null {
  const xf = req.headers.get('x-forwarded-for')
  return xf ? xf.split(',')[0].trim() : (req.headers.get('x-real-ip') || null)
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params
  const db = rastrDb()

  const id = /^\d+$/.test(codigo) ? Number(codigo) : null
  const { data: link } = id != null
    ? await db.from('rastreamento_links').select('*').eq('id', id).maybeSingle()
    : { data: null }

  if (!link || link.ativo === false) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const empresaId = link.empresa_id as number
  const q = req.nextUrl.searchParams
  const pick = (k: string, fb?: string | null) => (q.get(k) || fb || null)
  const fbclid = pick('fbclid')
  const fbc = fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}` : null

  // Registra a visita (UTM do link como default, sobrescrito pela query da URL).
  const { data: visita } = await db.from('rastreamento_visitas').insert({
    empresa_id: empresaId, link_id: link.id,
    utm_source: pick('utm_source', link.utm_source), utm_medium: pick('utm_medium', link.utm_medium),
    utm_campaign: pick('utm_campaign', link.utm_campaign), utm_content: pick('utm_content', link.utm_content),
    utm_term: pick('utm_term', link.utm_term),
    fbclid, gclid: pick('gclid'), gbraid: pick('gbraid'), wbraid: pick('wbraid'), ta_cod: pick('ta_cod'),
    referrer: req.headers.get('referer'), page_url: req.url,
    ip: ip(req), user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null, fbc,
  }).select('id, tracking_id').single()

  let code: string | null = null
  if (visita) {
    code = (visita.tracking_id as string).replace(/-/g, '').toLowerCase().slice(0, 8)
    await db.from('rastreamento_visitas').update({ visitor_code: code }).eq('id', visita.id as number)
    await db.from('rastreamento_eventos').insert({
      empresa_id: empresaId, visita_id: visita.id as number, tipo: 'pageview', capi_status: 'desativado',
    })
  }

  // Monta o destino, carimbando o código no texto do WhatsApp quando houver.
  let destino = String(link.destino_url)
  try {
    const u = new URL(destino)
    const ehWa = /(^|\.)(wa\.me|whatsapp\.com)$/i.test(u.hostname)
    if (ehWa && code) {
      const text = u.searchParams.get('text')
      if (text && !/\[@[A-Za-z0-9]{6,16}\]/.test(text)) {
        const mk = encodeURIComponent(` [@${code}]`)
        destino = destino.replace(/([?&]text=)([^&#]*)/, (_m, p, v) => p + v + mk)
      }
    }
  } catch { /* destino inválido: redireciona como está */ }

  return NextResponse.redirect(destino, { status: 302 })
}
