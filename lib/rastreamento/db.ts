import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente de serviço para as tabelas rastreamento_*.
 *
 * As tabelas novas ainda não estão nos tipos gerados (@/types/database), então
 * aqui usamos um client SEM o generic Database — as queries a `rastreamento_*`
 * funcionam e as linhas são tipadas à mão em lib/rastreamento/types.ts.
 *
 * Sempre service role: o pixel e o webhook escrevem sem sessão de usuário. A
 * proteção multi-tenant é feita por filtro explícito de empresa_id no código
 * (o RLS por get_empresa_id() protege apenas o acesso autenticado do painel).
 */
export function rastrDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
