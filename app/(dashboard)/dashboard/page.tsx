import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'

export const metadata = { title: 'Dashboard' }

async function getDashboardData() {
  const supabase = await createClient()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [
    { data: vendasMes },
    { count: totalClientes },
    { count: leadsAtivos },
    { count: leadsNovos },
    { count: estoqueDisponivel },
    { count: assistenciasAbertas },
    { data: vendasRecentes },
    { data: leadsRecentes },
  ] = await Promise.all([
    supabase
      .from('vendas')
      .select('valor_venda, lucro, forma_pagamento, canal_venda, data_venda')
      .gte('data_venda', startOfMonth.toISOString())
      .eq('status', 'concluida'),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('ativo', true).eq('kanban_status', 'novo'),
    supabase.from('inventario_unidades').select('*', { count: 'exact', head: true }).eq('status', 'disponivel').eq('ativo', true),
    supabase.from('garantias_assistencias').select('*', { count: 'exact', head: true }).not('status', 'in', '(concluida,cancelada)'),
    supabase
      .from('vendas')
      .select('id, valor_venda, forma_pagamento, canal_venda, data_venda, status')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('leads')
      .select('id, nome, origem, kanban_status, created_at, produto_interessado, msgs_nao_lidas')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const receitaMes = vendasMes?.reduce((sum, v) => sum + (v.valor_venda ?? 0), 0) ?? 0
  const lucroMes = vendasMes?.reduce((sum, v) => sum + (v.lucro ?? 0), 0) ?? 0
  const qtdVendasMes = vendasMes?.length ?? 0
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
    vendasRecentes: vendasRecentes ?? [],
    leadsRecentes: leadsRecentes ?? [],
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <>
      <Topbar
        eyebrow="Resumo do negócio"
        title="Visão geral"
        showPeriods
      />
      <DashboardView data={data} />
    </>
  )
}
