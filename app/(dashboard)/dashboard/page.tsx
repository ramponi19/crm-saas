import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'
import { capacidades, carregarConfigEmpresa } from '@/lib/empresa-config'
import { escopoDoUsuario } from '@/lib/escopo'
import { painelCompleto } from '@/lib/painel/metricas'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { contextoDaSessao, temPermissao } from '@/lib/sessao'
import DashboardImob from '@/components/modules/imoveis/dashboard-imob'

export const metadata = { title: 'Dashboard' }

async function getDashboardData(verCusto: boolean) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  /**
   * O dashboard mostrava o faturamento, o lucro e o ticket da EMPRESA INTEIRA
   * para qualquer um que entrasse — inclusive o vendedor. Agora, sem a
   * permissão "ver vendas e resultados de outros", cada um vê o próprio número.
   *
   * Uma conta só, aqui no servidor (lib/painel/metricas.ts → painelCompleto). Até
   * 21/10/2026 o navegador ainda chamava /api/dashboard e refazia tudo.
   *
   * Custo protegido (etapa 1.1e): sem estoque.ver_custo o custo nem é lido; lucro e margem ficam nulos e o card
   * some da tela.
   */
  const [escopo, fuso] = await Promise.all([escopoDoUsuario(supabase, empresaId), fusoDaEmpresa(supabase, empresaId)])
  return painelCompleto(supabase, empresaId, escopo, fuso, { verCusto })
}

export default async function DashboardPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  // `telasProprias`: um módulo ligado (Imóveis) traz dashboard próprio. Uma tela só
  // com seções por módulo é a regra (e) do 05, ainda por fazer.
  if (capacidades(await carregarConfigEmpresa(supabase, empresaId ?? 0)).telasProprias) {
    return <DashboardImob />
  }
  const verCusto = temPermissao(await contextoDaSessao(), 'estoque.ver_custo')
  const data = await getDashboardData(verCusto)
  return <DashboardView data={data} verCusto={verCusto} />
}
