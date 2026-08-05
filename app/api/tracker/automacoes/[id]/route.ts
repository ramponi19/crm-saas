import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/** Ativa/pausa, edita ou exclui uma automação (escopado à empresa). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId } = await trackerEmpresa()
  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if ('ativo' in body) patch.ativo = !!body.ativo
  if ('nome' in body) patch.nome = String(body.nome ?? '').trim() || null
  if ('acoes' in body && Array.isArray(body.acoes)) patch.acoes = body.acoes
  if ('gatilho_config' in body) patch.gatilho_config = body.gatilho_config

  const db = rastrDb()
  const { error } = await db.from('tracker_automacao').update(patch).eq('empresa_id', empresaId).eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId } = await trackerEmpresa()
  const { id } = await ctx.params
  const db = rastrDb()
  const { error } = await db.from('tracker_automacao').delete().eq('empresa_id', empresaId).eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
