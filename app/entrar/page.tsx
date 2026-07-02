import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Rota neutra pós-login: decide o destino conforme o papel do usuário.
// Super admin → painel global; dono/admin da empresa → painel de administração;
// vendedor/técnico → dashboard operacional do tenant.
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
    .select('empresa_id, role')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!vinculo) redirect('/register')

  // Dono/admin abrem direto no painel de administração; demais no CRM.
  if (vinculo.role === 'owner' || vinculo.role === 'admin') {
    redirect('/admin')
  }
  redirect('/dashboard')
}
