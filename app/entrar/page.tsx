import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Rota neutra pós-login: decide o destino conforme o papel do usuário.
// Super admin → painel global; dono/operador de empresa → dashboard do tenant.
export default async function EntrarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (usuario?.is_super_admin) {
    redirect('/superadmin')
  }

  // Não é super admin: precisa de vínculo ativo com uma empresa
  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!vinculo) redirect('/register')
  redirect('/dashboard')
}
