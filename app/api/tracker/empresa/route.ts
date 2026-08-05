import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { rastrDb } from '@/lib/rastreamento/db'

/** Atualiza dados básicos da empresa a partir do Tracker (owner/admin). */
export async function PATCH(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const nome = String(body.nome ?? '').trim()
  if (!nome) return NextResponse.json({ error: 'nome_obrigatorio' }, { status: 400 })

  const db = rastrDb()
  const { error } = await db.from('empresas').update({ nome }).eq('id', auth.empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
