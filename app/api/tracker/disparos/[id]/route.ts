import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/** Muda status / exclui uma campanha de disparo (escopado à empresa). */
const VALIDOS = new Set(['rascunho', 'ativa', 'pausada', 'concluida'])

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId } = await trackerEmpresa()
  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (typeof body.status === 'string' && VALIDOS.has(body.status)) patch.status = body.status
  if ('mensagem' in body) patch.mensagem = String(body.mensagem ?? '').trim() || null

  const db = rastrDb()
  const { error } = await db.from('tracker_disparo').update(patch).eq('empresa_id', empresaId).eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId } = await trackerEmpresa()
  const { id } = await ctx.params
  const db = rastrDb()
  const { error } = await db.from('tracker_disparo').delete().eq('empresa_id', empresaId).eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
