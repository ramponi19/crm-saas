import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

/**
 * Guards de papel escopados ao TENANT (empresa do usuário logado).
 *
 * Espelha lib/superadmin.ts, mas em vez do flag global `is_super_admin`,
 * autoriza com base no papel em `empresa_usuarios.role` da empresa ativa:
 *   owner > admin > vendedor / tecnico
 *
 * Um super admin (plataforma) impersonando uma empresa é tratado como `owner`
 * dela — mantendo consistência com getEmpresaId()/RLS.
 */

export type EmpresaRole = 'owner' | 'admin' | 'vendedor' | 'tecnico' | 'member'

type Resolved = { empresaId: number | null; role: EmpresaRole; isSuper: boolean }

/** Resolve empresa ativa + papel do usuário SEM redirecionar (uso interno/API). */
async function resolveEmpresaERole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Resolved> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin, impersonando_empresa_id, impersonando_expires_at')
    .eq('id', userId)
    .single()

  const isSuper = !!usuario?.is_super_admin

  // super admin impersonando (dentro do TTL) => owner da empresa impersonada
  if (
    isSuper &&
    usuario?.impersonando_empresa_id &&
    usuario.impersonando_expires_at &&
    new Date(usuario.impersonando_expires_at) > new Date()
  ) {
    return { empresaId: usuario.impersonando_empresa_id, role: 'owner', isSuper }
  }

  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id, role')
    .eq('usuario_id', userId)
    .eq('ativo', true)
    .single()

  if (!vinculo) return { empresaId: null, role: 'member', isSuper }
  return {
    empresaId: vinculo.empresa_id,
    role: (isSuper ? 'owner' : (vinculo.role as EmpresaRole)) ?? 'member',
    isSuper,
  }
}

/**
 * Guard para páginas/server components: exige que o papel do usuário na empresa
 * esteja em `allowed`. Redireciona /login (sem sessão) ou /dashboard (sem papel).
 * Retorna { userId, empresaId, role }.
 */
export async function requireEmpresaRole(
  allowed: EmpresaRole[],
): Promise<{ userId: string; empresaId: number; role: EmpresaRole }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { empresaId, role } = await resolveEmpresaERole(supabase, user.id)
  if (!empresaId) redirect('/login')
  if (!allowed.includes(role)) redirect('/dashboard')

  return { userId: user.id, empresaId, role }
}

/**
 * Versão para API Routes: retorna { userId, empresaId, role, supabase } em sucesso,
 * ou { error: NextResponse } com 401/403 — nunca redireciona.
 */
export async function requireEmpresaRoleApi(
  allowed: EmpresaRole[],
): Promise<
  | { userId: string; empresaId: number; role: EmpresaRole; supabase: Awaited<ReturnType<typeof createClient>>; error?: never }
  | { error: NextResponse; userId?: never; empresaId?: never; role?: never; supabase?: never }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  }

  const { empresaId, role } = await resolveEmpresaERole(supabase, user.id)
  if (!empresaId || !allowed.includes(role)) {
    return { error: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }

  return { userId: user.id, empresaId, role, supabase }
}

/** Atalhos comuns. */
export const requireOwner = () => requireEmpresaRole(['owner'])
export const requireOwnerOrAdmin = () => requireEmpresaRole(['owner', 'admin'])
export const requireOwnerApi = () => requireEmpresaRoleApi(['owner'])
export const requireOwnerOrAdminApi = () => requireEmpresaRoleApi(['owner', 'admin'])

/**
 * Verifica sem redirecionar o papel do usuário na empresa ativa.
 * Útil em layouts/sidebars para mostrar/esconder itens de administração.
 * Retorna o papel (ou null se sem sessão/empresa).
 */
export async function getEmpresaRole(): Promise<EmpresaRole | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { empresaId, role } = await resolveEmpresaERole(supabase, user.id)
  return empresaId ? role : null
}
