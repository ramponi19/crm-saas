import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { escopoDoUsuario } from '@/lib/escopo'
import { painelCompleto } from '@/lib/painel/metricas'
import DashboardImob from './dashboard-imob'

export const metadata = { title: 'Dashboard' }

async function getDashboardData() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  /**
   * O dashboard mostrava o faturamento, o lucro e o ticket da EMPRESA INTEIRA
   * para qualquer um que entrasse — inclusive o vendedor. Agora, sem a
   * permissão "ver vendas e resultados de outros", cada um vê o próprio número.
   *
   * Uma conta só, aqui no servidor (lib/painel/metricas.ts → painelCompleto). Até
   * 21/10/2026 o navegador ainda chamava /api/dashboard e refazia tudo.
   */
  const escopo = await escopoDoUsuario(supabase, empresaId)
  return painelCompleto(supabase, empresaId, escopo)
}

export default async function DashboardPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  // `maybeSingle`: empresa ausente cai no dashboard padrão em vez de lançar.
  const { data: empresa } = await supabase.from('empresas').select('segmento:preset_onboarding').eq('id', empresaId).maybeSingle()
  // `telasProprias`: a vertical tem dashboard próprio. Concessionária vai querer
  // o dela, e aí liga a capacidade em vez de acrescentar outro `if` aqui.
  if (SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades.telasProprias) {
    return <DashboardImob />
  }
  const data = await getDashboardData()
  return <DashboardView data={data} />
}
