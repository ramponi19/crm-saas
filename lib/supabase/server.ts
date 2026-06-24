import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Database } from '@/types/database'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

/** Returns the empresa_id for the current authenticated user, redirecting to /login if not found.
 *  If the user is a super admin impersonating, returns the impersonated empresa_id. */
export async function getEmpresaId(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fonte de verdade da impersonação: coluna persistida (compatível com RLS).
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin, impersonando_empresa_id')
    .eq('id', user.id)
    .single()

  if (usuario?.is_super_admin && usuario.impersonando_empresa_id) {
    return usuario.impersonando_empresa_id
  }

  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!vinculo) redirect('/login')
  return vinculo.empresa_id
}

/** Returns the impersonated empresa info if the current super admin is impersonating, else null. */
export async function getImpersonation(): Promise<{ empresaId: number; nome: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin, impersonando_empresa_id')
    .eq('id', user.id)
    .single()

  if (!usuario?.is_super_admin || !usuario.impersonando_empresa_id) return null

  const { data: empresa } = await supabase
    .from('empresas')
    .select('nome')
    .eq('id', usuario.impersonando_empresa_id)
    .single()

  return {
    empresaId: usuario.impersonando_empresa_id,
    nome: empresa?.nome ?? `Empresa #${usuario.impersonando_empresa_id}`,
  }
}
