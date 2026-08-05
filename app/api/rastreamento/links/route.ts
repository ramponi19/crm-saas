import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Links rastreáveis da empresa (owner/admin).
 * GET  → lista os links + contagem de visitas por link.
 * POST → cria um link novo (slug único por empresa).
 */
function slugify(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

export async function GET() {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const db = rastrDb()

  const { data: links } = await db.from('rastreamento_links')
    .select('*').eq('empresa_id', auth.empresaId).order('criado_em', { ascending: false })

  // Visitas por link (métrica de clique real).
  const { data: visitas } = await db.from('rastreamento_visitas')
    .select('link_id').eq('empresa_id', auth.empresaId).not('link_id', 'is', null)
  const cont = new Map<number, number>()
  for (const v of (visitas ?? []) as { link_id: number }[]) cont.set(v.link_id, (cont.get(v.link_id) ?? 0) + 1)

  const out = (links ?? []).map((l) => ({ ...l, visitas: cont.get(l.id as number) ?? 0 }))
  return NextResponse.json({ links: out })
}

export async function POST(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const titulo = String(body.titulo ?? '').trim() || null
  const waNumero = String(body.wa_numero ?? '').replace(/\D/g, '') || null
  const waTexto = String(body.wa_texto ?? '').trim() || null
  let destino = String(body.destino_url ?? '').trim()

  // Se for link de WhatsApp, monta o wa.me a partir do número + texto.
  if (!destino && waNumero) {
    const num = waNumero.startsWith('55') ? waNumero : '55' + waNumero
    destino = `https://wa.me/${num}` + (waTexto ? `?text=${encodeURIComponent(waTexto)}` : '')
  }
  if (!destino) return NextResponse.json({ error: 'destino_ou_numero_obrigatorio' }, { status: 400 })

  const base = slugify(String(body.slug ?? titulo ?? 'link') || 'link') || 'link'
  const db = rastrDb()

  // Garante slug único por empresa (sufixa -2, -3, ...).
  let slug = base
  for (let i = 2; i < 50; i++) {
    const { data: existe } = await db.from('rastreamento_links')
      .select('id').eq('empresa_id', auth.empresaId).eq('slug', slug).maybeSingle()
    if (!existe) break
    slug = `${base}-${i}`
  }

  const { data, error } = await db.from('rastreamento_links').insert({
    empresa_id: auth.empresaId, slug, titulo, destino_url: destino,
    wa_numero: waNumero, wa_texto: waTexto,
    utm_source: String(body.utm_source ?? '').trim() || null,
    utm_medium: String(body.utm_medium ?? '').trim() || null,
    utm_campaign: String(body.utm_campaign ?? '').trim() || null,
    utm_content: String(body.utm_content ?? '').trim() || null,
    utm_term: String(body.utm_term ?? '').trim() || null,
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data })
}
