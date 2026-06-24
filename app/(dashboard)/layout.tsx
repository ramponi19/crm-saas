import { Sidebar } from '@/components/layout/sidebar'
import { NotificationProvider } from '@/components/layout/notification-provider'
import { ImpersonationBanner } from '@/components/superadmin/impersonation-banner'
import { LimiteBanner } from '@/components/layout/limite-banner'
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

  const { data: usuarioRaw } = await supabase
    .from('usuarios')
    .select('nome, is_super_admin')
    .eq('id', user.id)
    .single()
  const usuario = usuarioRaw as unknown as { nome: string; is_super_admin: boolean } | null

  // Impersonação: super admin operando como uma empresa específica.
  const impersonation = await getImpersonation()

  // Resolver a empresa do contexto: impersonada (super admin) ou a do vínculo.
  let empresa: { nome: string; wl_cor: string | null; wl_logo_url: string | null } | null = null
  let role = 'owner'

  if (impersonation) {
    // Super admin impersonando: busca os dados da empresa impersonada diretamente.
    const { data: empImp } = await supabase
      .from('empresas')
      .select('nome, wl_cor, wl_logo_url')
      .eq('id', impersonation.empresaId)
      .single()
    empresa = empImp ?? { nome: impersonation.nome, wl_cor: null, wl_logo_url: null }
    role = 'owner' // super admin tem controle total na empresa impersonada
  } else {
    // Fluxo normal: usuário precisa de vínculo com uma empresa.
    const { data: vinculo } = await supabase
      .from('empresa_usuarios')
      .select('role, empresa:empresas(id, nome, plano, wl_cor, wl_logo_url)')
      .eq('usuario_id', user.id)
      .eq('ativo', true)
      .single()

    // Super admin sem vínculo e sem impersonar: mandar para o painel.
    if (!vinculo) {
      if (usuario?.is_super_admin) redirect('/superadmin')
      redirect('/register')
    }

    const vinculoTyped = vinculo as unknown as {
      role: string
      empresa: { nome: string; wl_cor: string | null; wl_logo_url: string | null } | null
    }
    empresa = vinculoTyped.empresa
    role = vinculoTyped.role
  }

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('kanban_status', 'novo')

  return (
    <EmpresaProvider>
      <div className="flex h-screen bg-[#F4F6F9] overflow-hidden">
        <Sidebar
          userName={usuario?.nome ?? user.email ?? 'Usuário'}
          userRole={
            role === 'owner' ? 'Proprietário'
              : role === 'admin' ? 'Administrador'
              : role === 'tecnico' ? 'Técnico'
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
          <LimiteBanner />
          {children}
        </div>
      </div>
      <NotificationProvider />
    </EmpresaProvider>
  )
}
