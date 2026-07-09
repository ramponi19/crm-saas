import { createServiceClient } from '@/lib/supabase/service'
import { FipeView } from './fipe-view'

export const metadata = { title: 'Tabela FIPE' }

// Acesso já trancado por app/superadmin/layout.tsx (requireSuperAdmin).
export default async function FipePage() {
  const svc = createServiceClient()
  const [{ data: ref }, { count }] = await Promise.all([
    svc.from('fipe_referencia').select('codigo, mes, atualizado_em').eq('id', 1).maybeSingle(),
    svc.from('fipe_consultas').select('*', { count: 'exact', head: true }),
  ])
  return <FipeView mes={ref?.mes ?? null} atualizadoEm={ref?.atualizado_em ?? null} totalCache={count ?? 0} />
}
