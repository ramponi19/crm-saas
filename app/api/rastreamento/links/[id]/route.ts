import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { rastrDb } from '@/lib/rastreamento/db'

/** Edição/remoção de um link rastreável (owner/admin, escopado à empresa). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const { id } = await ctx.params

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const k of ['titulo', 'destino_url', 'wa_numero', 'wa_texto', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    if (k in body) patch[k] = String(body[k] ?? '').trim() || null
  }
  if ('ativo' in body) patch.ativo = !!body.ativo

  const db = rastrDb()
  const { error } = await db.from('rastreamento_links')
    .update(patch).eq('id', Number(id)).eq('empresa_id', auth.empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const { id } = await ctx.params

  const db = rastrDb()
  const { error } = await db.from('rastreamento_links')
    .delete().eq('id', Number(id)).eq('empresa_id', auth.empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
