import { SuperAdminShell } from '@/components/superadmin/superadmin-shell'
import { requireSuperAdmin } from '@/lib/superadmin'
import { createClient } from '@/lib/supabase/server'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userId = await requireSuperAdmin()

  const supabase = await createClient()
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome')
    .eq('id', userId)
    .single()

  return (
    <SuperAdminShell userName={usuario?.nome ?? 'Super Admin'}>
      {children}
    </SuperAdminShell>
  )
}
