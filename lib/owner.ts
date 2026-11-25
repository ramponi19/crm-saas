import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { contextoDaSessao } from '@/lib/sessao'

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

/**
 * Resolve empresa ativa + papel do usuário SEM redirecionar (uso interno/API).
 *
 * Etapa 1.1b: lê o contexto da sessão (sessao_contexto no banco): a empresa é a de get_empresa_id (empresa
 * ativa ou único vínculo) e o papel é o do cargo NESSA empresa. Antes lia o primeiro vínculo sem filtro de
 * empresa. Superadmin impersonando continua 'owner' da empresa impersonada.
 */
async function resolveEmpresaERole(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  _userId: string,
): Promise<Resolved> {
  const ctx = await contextoDaSessao()
  if (!ctx || !ctx.empresa_id) return { empresaId: null, role: 'member', isSuper: !!ctx?.superadmin }
  return { empresaId: ctx.empresa_id, role: (ctx.papel ?? 'member') as EmpresaRole, isSuper: ctx.superadmin }
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
