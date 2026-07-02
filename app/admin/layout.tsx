import { redirect } from 'next/navigation'
import { createClient, getImpersonation } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { EmpresaProvider } from '@/lib/empresa-context'
import { NotificationProvider } from '@/components/layout/notification-provider'
import { SessionGuard } from '@/components/layout/session-guard'
import { ImpersonationBanner } from '@/components/superadmin/impersonation-banner'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

/**
 * Área de Administração do DONO (owner/admin), escopada ao tenant.
 * Espelha a estrutura do /superadmin, mas restrita à empresa do usuário.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // guard: só owner/admin (super admin impersonando = owner). Senão → /dashboard ou /login
  const { userId, empresaId, role } = await requireEmpresaRole(['owner', 'admin'])

  const supabase = await createClient()
  const [{ data: usuario }, { data: empresa }] = await Promise.all([
    supabase.from('usuarios').select('nome, email').eq('id', userId).single(),
    supabase.from('empresas').select('nome').eq('id', empresaId).single(),
  ])
  const impersonation = await getImpersonation()

  return (
    <EmpresaProvider>
      <div className="flex h-screen bg-[#F4F6F9] overflow-hidden">
        <AdminSidebar
          userName={usuario?.nome ?? usuario?.email ?? 'Administrador'}
          empresaNome={empresa?.nome ?? 'Minha empresa'}
          role={role}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {impersonation && <ImpersonationBanner empresaNome={impersonation.nome} />}
          <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        </div>
      </div>
      <NotificationProvider />
      <SessionGuard />
    </EmpresaProvider>
  )
}
