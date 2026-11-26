import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { fetchComUsuario } from './usuario-na-escrita'

/**
 * Cliente com a chave de serviço (passa por cima da RLS). Nas escritas feitas dentro de uma requisição com usuário
 * logado, o `fetch` manda o id dele para o banco auditar a escrita da plataforma (lib/supabase/usuario-na-escrita.ts).
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetchComUsuario } }
  )
}
