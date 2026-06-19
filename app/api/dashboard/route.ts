import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Períodos e suas datas de início (todos terminam em "agora")
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
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const starts = getPeriodStarts()

  // ── 1 query só: traz todas as vendas concluídas do ANO (maior período)
  //    e calcula os 5 períodos no servidor a partir desse conjunto.
  //    Como filtramos pelo maior período, um único fetch cobre todos. ──
  const inicioAno = starts.ano.toISOString()
  const { data: vendasRaw } = await supabase
    .from('vendas')
    .select('valor_venda, lucro, data_venda')
    .gte('data_venda', inicioAno)
    .eq('status', 'concluida')

  const vendas = (vendasRaw ?? []) as Array<{
    valor_venda: number
    lucro: number | null
    data_venda: string | null
  }>

  // Calcula KPIs por período a partir do conjunto único
  const periods: Record<string, PeriodKpis> = {}
  for (const [key, start] of Object.entries(starts)) {
    const startMs = start.getTime()
    const filtradas = vendas.filter(v => {
      if (!v.data_venda) return false
      return new Date(v.data_venda).getTime() >= startMs
    })
    const receita = filtradas.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
    const lucro = filtradas.reduce((s, v) => s + (Number(v.lucro) || 0), 0)
    const qtdVendas = filtradas.length
    periods[key] = {
      receita,
      lucro,
      qtdVendas,
      ticketMedio: qtdVendas > 0 ? receita / qtdVendas : 0,
    }
  }

  // ── Contadores globais (não dependem de período) ──
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
