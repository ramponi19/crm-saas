import { SuperAdminShell } from '@/components/superadmin/superadmin-shell'
import { SessionGuard } from '@/components/layout/session-guard'
import { requireSuperAdmin } from '@/lib/superadmin'
import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import { AvisoRotinas } from '@/components/superadmin/aviso-rotinas'

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
      <Suspense fallback={null}><AvisoRotinas /></Suspense>
      {children}
      <SessionGuard />
    </SuperAdminShell>
  )
}
