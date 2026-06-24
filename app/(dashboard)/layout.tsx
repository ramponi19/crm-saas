import { Sidebar } from '@/components/layout/sidebar'
import { NotificationProvider } from '@/components/layout/notification-provider'
import { ImpersonationBanner } from '@/components/superadmin/impersonation-banner'
import { createClient } from '@/lib/supabase/server'
import { getImpersonation } from '@/lib/supabase/server'
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

  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('role, empresa:empresas(id, nome, plano, wl_cor, wl_logo_url)')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!vinculo) redirect('/register')

  const { data: usuarioRaw } = await supabase
    .from('usuarios')
    .select('nome, is_super_admin')
    .eq('id', user.id)
    .single()

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('kanban_status', 'novo')

  const usuario = usuarioRaw as unknown as { nome: string; is_super_admin: boolean } | null
  const vinculoTyped = vinculo as unknown as { role: string; empresa: { nome: string; wl_cor: string | null; wl_logo_url: string | null } | null }
  const empresa = vinculoTyped.empresa

  const impersonation = await getImpersonation()

  return (
    <EmpresaProvider>
      <div className="flex h-screen bg-[#F4F6F9] overflow-hidden">
        <Sidebar
          userName={usuario?.nome ?? user.email ?? 'Usuário'}
          userRole={
            vinculoTyped.role === 'owner' ? 'Proprietário'
              : vinculoTyped.role === 'admin' ? 'Administrador'
              : vinculoTyped.role === 'tecnico' ? 'Técnico'
              : 'Vendedor'
          }
          userEmpresa={empresa?.nome}
          leadsCount={leadsCount ?? 0}
          empresaCor={empresa?.wl_cor ?? '#D7282F'}
          empresaLogo={empresa?.wl_logo_url ?? null}
          isSuperAdmin={usuario?.is_super_admin ?? false}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {impersonation && <ImpersonationBanner empresaNome={impersonation.nome} />}
          {children}
        </div>
      </div>
      <NotificationProvider />
    </EmpresaProvider>
  )
}
