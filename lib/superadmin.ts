import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

/**
 * Garante que o usuário atual é super admin.
 * Redireciona para /dashboard se não for, ou /login se não autenticado.
 * Retorna o id do usuário super admin.
 */
export async function requireSuperAdmin(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (!usuario?.is_super_admin) redirect('/dashboard')
  return user.id
}

/**
 * Versão para API Routes: retorna { userId, supabase } em caso de sucesso,
 * ou { error: NextResponse } com 401/403 — nunca redireciona.
 */
export async function requireSuperAdminApi(): Promise<
  | { userId: string; supabase: Awaited<ReturnType<typeof createClient>>; error?: never }
  | { error: NextResponse; userId?: never; supabase?: never }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (!usuario?.is_super_admin) {
    return { error: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }

  return { userId: user.id, supabase }
}

/**
 * Verifica sem redirecionar se o usuário atual é super admin.
 * Útil em layouts/sidebars do tenant para exibir o link de acesso ao painel.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  return usuario?.is_super_admin ?? false
}

/**
 * Registra uma ação administrativa no log de auditoria.
 * Falhas de log nunca devem quebrar a operação principal — apenas logamos o erro.
 */
export async function logSuperAdminAction(params: {
  adminUserId: string
  empresaId?: number | null
  acao: string
  detalhes?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('superadmin_logs').insert({
      admin_user_id: params.adminUserId,
      empresa_id: params.empresaId ?? null,
      acao: params.acao,
      detalhes: (params.detalhes ?? {}) as never,
    })
  } catch (err) {
    console.error('Falha ao registrar log de super admin:', err)
  }
}
