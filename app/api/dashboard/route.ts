import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getPeriodStarts(): Record<string, Date> {
  const now = new Date()
  const hoje = new Date(now); hoje.setHours(0, 0, 0, 0)
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7); d7.setHours(0, 0, 0, 0)
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30); d30.setHours(0, 0, 0, 0)
  const mes = new Date(now.getFullYear(), now.getMonth(), 1)
  const ano = new Date(now.getFullYear(), 0, 1)
  return { hoje, '7d': d7, '30d': d30, mes, ano }
}

interface PeriodKpis {
  receita: number
  lucro: number
  qtdVendas: number
  ticketMedio: number
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const starts = getPeriodStarts()

  // 12 meses atrás para pegar tudo de uma vez
  const inicio12m = new Date()
  inicio12m.setMonth(inicio12m.getMonth() - 12)
  inicio12m.setDate(1)
  inicio12m.setHours(0, 0, 0, 0)

  const { data: vendasRaw } = await supabase
    .from('vendas')
    .select('valor_venda, lucro, data_venda')
    .gte('data_venda', inicio12m.toISOString())
    .eq('status', 'concluida')

  const vendas = (vendasRaw ?? []) as Array<{
    valor_venda: number
    lucro: number | null
    data_venda: string | null
  }>

  // KPIs por período
  const periods: Record<string, PeriodKpis> = {}
  for (const [key, start] of Object.entries(starts)) {
    const startMs = start.getTime()
    const filtradas = vendas.filter(v => v.data_venda && new Date(v.data_venda).getTime() >= startMs)
    const receita = filtradas.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
    const lucro = filtradas.reduce((s, v) => s + (Number(v.lucro) || 0), 0)
    const qtdVendas = filtradas.length
    periods[key] = { receita, lucro, qtdVendas, ticketMedio: qtdVendas > 0 ? receita / qtdVendas : 0 }
  }

  // Faturamento mensal dos últimos 12 meses para o gráfico
  const monthlyMap: Record<string, number> = {}
  vendas.forEach(v => {
    if (!v.data_venda) return
    const d = new Date(v.data_venda)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = (monthlyMap[key] ?? 0) + (Number(v.valor_venda) || 0)
  })
  const faturamentoMensal = Object.entries(monthlyMap).map(([mes, total]) => ({ mes, total }))

  // Contadores globais em paralelo
  const [
    { count: totalClientes },
    { count: leadsAtivos },
    { count: leadsNovos },
    { count: estoqueDisponivel },
    { count: assistenciasAbertas },
    { data: vendasRecentes },
  ] = await Promise.all([
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('ativo', true).eq('kanban_status', 'novo'),
    supabase.from('inventario_unidades').select('*', { count: 'exact', head: true }).eq('status', 'disponivel').eq('ativo', true),
    supabase.from('garantias_assistencias').select('*', { count: 'exact', head: true }).not('status', 'in', '(concluida,cancelada)'),
    supabase.from('vendas').select('id, valor_venda, forma_pagamento, canal_venda, data_venda, status').order('created_at', { ascending: false }).limit(5),
  ])

  return NextResponse.json({
    periods,
    faturamentoMensal,
    globais: {
      totalClientes: totalClientes ?? 0,
      leadsAtivos: leadsAtivos ?? 0,
      leadsNovos: leadsNovos ?? 0,
      estoqueDisponivel: estoqueDisponivel ?? 0,
      assistenciasAbertas: assistenciasAbertas ?? 0,
    },
    vendasRecentes: vendasRecentes ?? [],
  })
}
