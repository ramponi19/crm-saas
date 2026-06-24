import { SuperAdminSidebar } from '@/components/superadmin/superadmin-sidebar'
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
    <div className="flex h-screen bg-[#F4F6F9] overflow-hidden">
      <SuperAdminSidebar userName={usuario?.nome ?? 'Super Admin'} />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
