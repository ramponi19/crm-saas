import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { nadaGravado, NADA_GRAVADO } from '@/lib/linhas-afetadas'
import { corValida, validarNome, type Etiqueta } from '@/lib/etiquetas'

/**
 * ETIQUETAS DA EMPRESA (core, 11/11/2026).
 *
 * GET              → todas, em ordem de nome (qualquer membro: o vendedor aplica as que existem).
 * POST   {nome,cor}          → cria   (dono/admin)
 * PATCH  {id,nome?,cor?}     → renomeia / troca a cor (dono/admin)
 * DELETE ?id=                → apaga: o banco tira dos contatos (com histórico) e apaga as
 *                              automações "recebeu etiqueta" dela (dono/admin)
 *
 * A RLS de `etiquetas` também barra a escrita de quem não é dono/admin; a rota confere as
 * linhas gravadas (0 linhas = 403/404, nunca "ok").
 */

async function lista(db: Awaited<ReturnType<typeof createClient>>, empresaId: number): Promise<Etiqueta[]> {
  const { data, error } = await db.from('etiquetas').select('id, nome, cor').eq('empresa_id', empresaId).order('nome')
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: number; nome: string; cor: string }[]).map((e) => ({ id: e.id, nome: e.nome, cor: corValida(e.cor) }))
}

function nomeRepetido(msg: string) {
  return /etiquetas_nome_uidx|duplicate key/i.test(msg)
}

export async function GET() {
  const [db, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await db.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    return NextResponse.json({ etiquetas: await lista(db, empresaId) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const { supabase: db, empresaId, userId } = auth
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const v = validarNome(b.nome, await lista(db, empresaId))
  if ('erro' in v) return NextResponse.json({ error: v.erro }, { status: 400 })
  const { data, error } = await db.from('etiquetas')
    .insert({ empresa_id: empresaId, nome: v.nome, cor: corValida(b.cor), criada_por: userId } as never)
    .select('id, nome, cor')
  if (error) {
    if (nomeRepetido(error.message)) return NextResponse.json({ error: `Já existe a etiqueta "${v.nome}".` }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (nadaGravado(data)) return NextResponse.json({ error: 'Nada foi gravado.' }, { status: 403 })
  return NextResponse.json({ ok: true, etiqueta: (data as Etiqueta[])[0] })
}

export async function PATCH(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const { supabase: db, empresaId } = auth
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = Number(b.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Etiqueta inválida.' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.nome !== undefined) {
    const v = validarNome(b.nome, await lista(db, empresaId), id)
    if ('erro' in v) return NextResponse.json({ error: v.erro }, { status: 400 })
    patch.nome = v.nome
  }
  if (b.cor !== undefined) patch.cor = corValida(b.cor)
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada para mudar.' }, { status: 400 })
  const { data, error } = await db.from('etiquetas').update(patch as never).eq('id', id).eq('empresa_id', empresaId).select('id, nome, cor')
  if (error) {
    if (nomeRepetido(error.message)) return NextResponse.json({ error: 'Já existe uma etiqueta com esse nome.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (nadaGravado(data)) return NextResponse.json({ error: NADA_GRAVADO }, { status: 404 })
  return NextResponse.json({ ok: true, etiqueta: (data as Etiqueta[])[0] })
}

export async function DELETE(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const { supabase: db, empresaId } = auth
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Etiqueta inválida.' }, { status: 400 })
  const { data, error } = await db.from('etiquetas').delete().eq('id', id).eq('empresa_id', empresaId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (nadaGravado(data)) return NextResponse.json({ error: NADA_GRAVADO }, { status: 404 })
  return NextResponse.json({ ok: true })
}
