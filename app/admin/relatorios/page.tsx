import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
import RelatoriosImobPage from '@/app/(dashboard)/relatorios-imob/page'

export const metadata = { title: 'Relatórios' }

// Relatórios é gestão → vive no /admin. Imob usa o relatório imobiliário;
// demais segmentos caem no BI genérico (/relatorios, plan-gated).
export default async function AdminRelatoriosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).single()
  if (normalizarSegmento(empresa?.segmento) !== 'imobiliaria') redirect('/relatorios')
  return <RelatoriosImobPage />
}
