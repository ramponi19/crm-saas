import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'
import { capacidades, carregarConfigEmpresa } from '@/lib/empresa-config'
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
  // `telasProprias`: um módulo ligado (Imóveis) traz dashboard próprio. Uma tela só
  // com seções por módulo é a regra (e) do 05, ainda por fazer.
  if (capacidades(await carregarConfigEmpresa(supabase, empresaId ?? 0)).telasProprias) {
    return <DashboardImob />
  }
  const data = await getDashboardData()
  return <DashboardView data={data} />
}
