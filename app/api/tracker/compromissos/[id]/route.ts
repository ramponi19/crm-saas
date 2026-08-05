import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/** Marca/desmarca um compromisso como concluído (escopado à empresa). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId } = await trackerEmpresa()
  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const concluida = !!body.concluida
  const db = rastrDb()
  const { error } = await db.from('tarefas')
    .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
    .eq('empresa_id', empresaId).eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId } = await trackerEmpresa()
  const { id } = await ctx.params
  const db = rastrDb()
  const { error } = await db.from('tarefas').delete().eq('empresa_id', empresaId).eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
