import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

const TONS = ['info', 'alerta', 'sucesso']
const ALVOS = ['todos', 'plano', 'empresa']

// Criar aviso
export async function POST(req: Request) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as {
    titulo?: string
    corpo?: string
    tom?: string
    alvo?: string
    alvo_valor?: string | null
    expira_em?: string | null
  }

  const titulo = (body.titulo ?? '').trim()
  if (!titulo) return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })

  const tom = TONS.includes(body.tom ?? '') ? body.tom! : 'info'
  const alvo = ALVOS.includes(body.alvo ?? '') ? body.alvo! : 'todos'
  const alvo_valor = alvo === 'todos' ? null : (body.alvo_valor?.trim() || null)
  if (alvo !== 'todos' && !alvo_valor) {
    return NextResponse.json({ error: 'Informe o plano ou a empresa alvo' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('avisos_plataforma')
    .insert({
      titulo,
      corpo: (body.corpo ?? '').trim(),
      tom,
      alvo,
      alvo_valor,
      expira_em: body.expira_em || null,
      ativo: true,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({ adminUserId: auth.userId, acao: 'criar_aviso', detalhes: { id: data?.id, titulo, alvo, alvo_valor } })
  return NextResponse.json({ ok: true, id: data?.id })
}

// Ativar/desativar aviso
export async function PATCH(req: Request) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as { id?: number; ativo?: boolean }
  if (!body.id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc
    .from('avisos_plataforma')
    .update({ ativo: !!body.ativo })
    .eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({ adminUserId: auth.userId, acao: 'alternar_aviso', detalhes: { id: body.id, ativo: !!body.ativo } })
  return NextResponse.json({ ok: true })
}

// Excluir aviso
export async function DELETE(req: Request) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({})) as { id?: number }
  if (!body.id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('avisos_plataforma').delete().eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({ adminUserId: auth.userId, acao: 'excluir_aviso', detalhes: { id: body.id } })
  return NextResponse.json({ ok: true })
}
