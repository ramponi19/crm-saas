import { Sidebar } from '@/components/layout/sidebar'
import { createClient } from '@/lib/supabase/server'
import { EmpresaProvider } from '@/lib/empresa-context'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Busca empresa do usuário
  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('role, empresa:empresas(id, nome, plano, wl_cor, wl_logo_url)')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  // Se não tem empresa vinculada, redireciona para onboarding
  if (!vinculo) redirect('/register')

  const { data: usuarioRaw } = await supabase
    .from('usuarios')
    .select('nome, role')
    .eq('id', user.id)
    .single()

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('kanban_status', 'novo')

  const usuario = usuarioRaw as { nome: string; role: string } | null
  const empresa = vinculo.empresa as { nome: string; wl_cor: string | null; wl_logo_url: string | null } | null

  return (
    <EmpresaProvider>
      <div className="flex h-screen bg-[#0A111E] overflow-hidden">
        <Sidebar
          userName={usuario?.nome ?? user.email ?? 'Usuário'}
          userRole={vinculo.role === 'owner' ? 'Proprietário' : usuario?.role === 'admin' ? 'Administrador' : 'Vendedor'}
          userEmpresa={empresa?.nome}
          leadsCount={leadsCount ?? 0}
          empresaCor={empresa?.wl_cor ?? '#D7282F'}
          empresaLogo={empresa?.wl_logo_url ?? null}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </EmpresaProvider>
  )
}
