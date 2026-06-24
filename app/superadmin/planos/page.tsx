import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/superadmin'
import PlanosAdminView from './planos-admin-view'

export default async function PlanosAdminPage() {
  await requireSuperAdmin()
  const supabase = await createClient()
  const { data: planos } = await supabase
    .from('planos_config')
    .select('*')
    .order('ordem')
  return <PlanosAdminView planos={planos ?? []} />
}
