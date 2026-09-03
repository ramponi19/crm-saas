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
            cookiesToSet.forEach(({ name, value, options }) => {
              // Strip persistence so auth cookies become session cookies —
              // they are cleared when the browser closes.
              const { maxAge: _m, expires: _e, ...sessionOptions } = options ?? {}
              cookieStore.set(name, value, sessionOptions)
            })
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
    .select('is_super_admin, impersonando_empresa_id, impersonando_expires_at')
    .eq('id', user.id)
    .single()

  if (usuario?.is_super_admin && usuario.impersonando_empresa_id) {
    if (usuario.impersonando_expires_at && new Date(usuario.impersonando_expires_at) > new Date()) {
      return usuario.impersonando_empresa_id
    }
    /**
     * TTL expirado: zera a impersonação no banco.
     *
     * ⚠️ Isto NUNCA rodou. Era `rpc('set_impersonation')` sem argumento, e essa
     * sobrecarga não existe (`p_empresa_id` não tem default) — a chamada
     * falhava, e o `.then()` de fire-and-forget engolia o erro. O sintoma era
     * uma impersonação VENCIDA parada na linha do superadmin por dias.
     *
     * O `await` aqui é de propósito: sem ele, a próxima requisição pode ler a
     * coluna antes da limpeza terminar e cair de novo neste mesmo ramo. Custa
     * uma ida ao banco num caminho que só roda quando o TTL acabou de vencer.
     *
     * Erro não interrompe: a impersonação já está expirada, então o código
     * abaixo segue para o vínculo real de qualquer forma. Limpar é higiene.
     */
    const { error } = await supabase.rpc('encerrar_impersonacao')
    if (error) console.warn('[impersonacao] nao consegui limpar o TTL vencido:', error.message)
  }

  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

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
    .select('is_super_admin, impersonando_empresa_id, impersonando_expires_at')
    .eq('id', user.id)
    .single()

  if (!usuario?.is_super_admin || !usuario.impersonando_empresa_id) return null
  if (usuario.impersonando_expires_at && new Date(usuario.impersonando_expires_at) <= new Date()) return null

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
