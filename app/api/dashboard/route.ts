import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Calcula o intervalo de datas com base no período selecionado
function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)

  switch (period) {
    case 'hoje':
      start.setHours(0, 0, 0, 0)
      break
    case '7d':
      start.setDate(start.getDate() - 7)
      start.setHours(0, 0, 0, 0)
      break
    case '30d':
      start.setDate(start.getDate() - 30)
      start.setHours(0, 0, 0, 0)
      break
    case 'mes':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      break
    case 'ano':
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
      break
    default:
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
  }
  return { start, end }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  // Verifica auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const period = req.nextUrl.searchParams.get('period') ?? 'mes'
  const { start, end } = getDateRange(period)

  // Vendas do período
  const { data: vendasRaw } = await supabase
    .from('vendas')
    .select('valor_venda, lucro, forma_pagamento, canal_venda, data_venda')
    .gte('data_venda', start.toISOString())
    .lte('data_venda', end.toISOString())
    .eq('status', 'concluida')

  // Vendas recentes (sempre últimas 5, independente do período)
  const { data: vendasRecentesRaw } = await supabase
    .from('vendas')
    .select('id, valor_venda, forma_pagamento, canal_venda, data_venda, status')
    .order('created_at', { ascending: false })
    .limit(5)

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

  const vendas = (vendasRaw ?? []) as Array<{
    valor_venda: number
    lucro: number | null
  }>

  const receitaMes = vendas.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
  const lucroMes = vendas.reduce((s, v) => s + (Number(v.lucro) || 0), 0)
  const qtdVendasMes = vendas.length
  const ticketMedio = qtdVendasMes > 0 ? receitaMes / qtdVendasMes : 0

  return NextResponse.json({
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
    vendasRecentes: vendasRecentesRaw ?? [],
    period,
  })
}
