import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/** Base de conhecimento da empresa que personaliza os agentes de IA. */
const CAMPOS = ['sobre', 'produtos', 'diferenciais', 'tom_voz', 'objecoes', 'horario']

export async function PATCH(req: Request) {
  const { empresaId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const patch: Record<string, unknown> = { empresa_id: empresaId, atualizado_em: new Date().toISOString() }
  for (const c of CAMPOS) if (c in body) patch[c] = String(body[c] ?? '').trim() || null

  const db = rastrDb()
  const { error } = await db.from('tracker_conhecimento').upsert(patch, { onConflict: 'empresa_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
