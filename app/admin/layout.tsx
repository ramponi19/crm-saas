import { createClient, getImpersonation } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { EmpresaProvider } from '@/lib/empresa-context'
import { NotificationProvider } from '@/components/layout/notification-provider'
import { SessionGuard } from '@/components/layout/session-guard'
import { AdminShell } from '@/components/admin/admin-shell'
import { rastrDb } from '@/lib/rastreamento/db'
import { inteligenciaLigada } from '@/lib/empresa-config'

/**
 * Área de Administração do DONO (owner/admin), escopada ao tenant.
 * Espelha a estrutura do /superadmin, mas restrita à empresa do usuário.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // guard: só owner/admin (super admin impersonando = owner). Senão → /dashboard ou /login
  const { userId, empresaId, role } = await requireEmpresaRole(['owner', 'admin'])

  const supabase = await createClient()
  const [{ data: usuario }, { data: empresa }, zapintelAtivo] = await Promise.all([
    supabase.from('usuarios').select('nome, email').eq('id', userId).single(),
    supabase.from('empresas').select('nome').eq('id', empresaId).single(),
    // Atalho do complemento ZapIntel: só aparece quando o
    // add-on está ativo: módulo 'inteligencia' de empresa_modulos (lib/empresa-config.ts).
    inteligenciaLigada(rastrDb(), empresaId),
  ])
  const impersonation = await getImpersonation()

  return (
    <EmpresaProvider>
      <AdminShell
        userName={usuario?.nome ?? usuario?.email ?? 'Administrador'}
        empresaNome={empresa?.nome ?? 'Minha empresa'}
        role={role}
        impersonationNome={impersonation?.nome ?? null}
        zapintelAtivo={zapintelAtivo}
      >
        {children}
      </AdminShell>
      <NotificationProvider />
      <SessionGuard />
    </EmpresaProvider>
  )
}
