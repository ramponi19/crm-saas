import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSuperAdminAction } from '@/lib/superadmin'

// Promover (por email) ou revogar (por id) super admins.
// Só super admins podem chamar.

async function exigirSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const { data: u } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()
  if (!u?.is_super_admin) return { erro: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  return { supabase, userId: user.id }
}

// Promover um usuário existente (por email) a super admin
export async function POST(req: NextRequest) {
  const ctx = await exigirSuperAdmin()
  if ('erro' in ctx) return ctx.erro
  const { supabase, userId } = ctx

  const { email } = await req.json() as { email: string }
  if (!email) return NextResponse.json({ error: 'E-mail obrigatório' }, { status: 400 })

  const { data: alvo } = await supabase
    .from('usuarios')
    .select('id, nome, is_super_admin')
    .eq('email', email)
    .single()

  if (!alvo) {
    return NextResponse.json(
      { error: 'Nenhum usuário com este e-mail. O usuário precisa já ter conta no sistema.' },
      { status: 404 }
    )
  }
  if (alvo.is_super_admin) {
    return NextResponse.json({ error: 'Este usuário já é super admin.' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient
    .from('usuarios')
    .update({ is_super_admin: true })
    .eq('id', alvo.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({
    adminUserId: userId,
    acao: 'promover_super_admin',
    detalhes: { email, nome: alvo.nome },
  })

  return NextResponse.json({ ok: true })
}

// Revogar super admin de um usuário (por id)
export async function DELETE(req: NextRequest) {
  const ctx = await exigirSuperAdmin()
  if ('erro' in ctx) return ctx.erro
  const { supabase, userId } = ctx

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  // Impedir auto-revogação (evita ficar sem nenhum super admin por engano)
  if (id === userId) {
    return NextResponse.json({ error: 'Você não pode revogar o seu próprio acesso.' }, { status: 400 })
  }

  // Garantir que sobre ao menos um super admin
  const { count } = await supabase
    .from('usuarios')
    .select('*', { count: 'exact', head: true })
    .eq('is_super_admin', true)

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Deve haver ao menos um super admin.' }, { status: 400 })
  }

  const { data: alvo } = await supabase
    .from('usuarios')
    .select('nome, email')
    .eq('id', id)
    .single()

  const serviceClient = createServiceClient()
  const { error } = await serviceClient
    .from('usuarios')
    .update({ is_super_admin: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({
    adminUserId: userId,
    acao: 'revogar_super_admin',
    detalhes: { id, email: alvo?.email, nome: alvo?.nome },
  })

  return NextResponse.json({ ok: true })
}
