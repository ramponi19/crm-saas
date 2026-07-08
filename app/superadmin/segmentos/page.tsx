import { createServiceClient } from '@/lib/supabase/service'
import { SegmentosView, type SegmentoRow } from './segmentos-view'

export const metadata = { title: 'Segmentos' }

// Acesso já trancado por app/superadmin/layout.tsx (requireSuperAdmin).
export default async function SegmentosPage() {
  const svc = createServiceClient()
  const { data } = await svc.from('segmentos_config').select('*').order('ordem')
  return <SegmentosView initial={(data ?? []) as SegmentoRow[]} />
}
