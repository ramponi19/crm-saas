import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
import RelatoriosImobPage from '@/app/(dashboard)/relatorios-imob/page'
import RelatoriosPage from '@/app/(dashboard)/relatorios/page'

export const metadata = { title: 'Relatórios' }

// Relatórios é gestão → vive DENTRO do /admin (sem jogar o dono pro CRM).
// Imob usa o relatório imobiliário; demais segmentos usam o BI genérico
// (plan-gated pelo próprio RelatoriosPage).
export default async function AdminRelatoriosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).single()
  return normalizarSegmento(empresa?.segmento) === 'imobiliaria'
    ? <RelatoriosImobPage />
    : <RelatoriosPage />
}
