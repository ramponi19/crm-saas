import { createClient } from '@/lib/supabase/server'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'

export const metadata = { title: 'Dashboard' }

async function getDashboardData() {
  const supabase = await createClient()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: vendasMesRaw } = await supabase
    .from('vendas')
    .select('*')
    .gte('data_venda', startOfMonth.toISOString())
    .eq('status', 'concluida')

  const { count: totalClientes } = await supabase
    .from('clientes')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)

  const { count: leadsAtivos } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)

  const { count: leadsNovos } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('kanban_status', 'novo')

  const { count: estoqueDisponivel } = await supabase
    .from('inventario_unidades')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'disponivel')
    .eq('ativo', true)

  const { count: assistenciasAbertas } = await supabase
    .from('garantias_assistencias')
    .select('*', { count: 'exact', head: true })
    .not('status', 'in', '(concluida,cancelada)')

  const { data: vendasRecentesRaw } = await supabase
    .from('vendas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: leadsRecentesRaw } = await supabase
    .from('leads')
    .select('*')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(5)

  const vendasMes = (vendasMesRaw ?? []) as Array<{
    valor_venda: number
    lucro: number | null
    forma_pagamento: string | null
    canal_venda: string | null
    data_venda: string | null
  }>

  const vendasRecentes = (vendasRecentesRaw ?? []) as Array<{
    id: number
    valor_venda: number
    forma_pagamento: string | null
    canal_venda: string | null
    data_venda: string | null
    status: string | null
  }>

  const leadsRecentes = (leadsRecentesRaw ?? []) as Array<{
    id: number
    nome: string | null
    origem: string | null
    kanban_status: string | null
    created_at: string | null
    produto_interessado: string | null
    msgs_nao_lidas: number | null
  }>

  const receitaMes = vendasMes.reduce((sum, v) => sum + (Number(v.valor_venda) || 0), 0)
  const lucroMes = vendasMes.reduce((sum, v) => sum + (Number(v.lucro) || 0), 0)
  const qtdVendasMes = vendasMes.length
  const ticketMedio = qtdVendasMes > 0 ? receitaMes / qtdVendasMes : 0

  return {
    kpis: {
      receitaMes,
      lucroMes,
      qtdVendasMes,
      ticketMedio,
      totalClientes: totalClientes ?? 0,
      leadsAtivos: leadsAtivos ?? 0,
      leadsNovos: leadsNovos ?? 0,
      estoqueDisponivel: estoqueDisponivel ?? 0,
      assistenciasAbertas: assistenciasAbertas ?? 0,
    },
    vendasRecentes,
    leadsRecentes,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardView data={data} />
}
