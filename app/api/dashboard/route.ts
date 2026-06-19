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

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const starts = getPeriodStarts()
  const inicio12m = new Date()
  inicio12m.setMonth(inicio12m.getMonth() - 12)
  inicio12m.setDate(1); inicio12m.setHours(0, 0, 0, 0)

  // Vendas do ano com cliente e produto
  const { data: vendasRaw } = await supabase
    .from('vendas')
    .select('id, valor_venda, lucro, data_venda, canal_venda, forma_pagamento, status, cliente_id, produto_id, vendedor_id')
    .gte('data_venda', inicio12m.toISOString())

  const vendas = (vendasRaw ?? []) as Array<{
    id: number; valor_venda: number; lucro: number | null
    data_venda: string | null; canal_venda: string | null
    forma_pagamento: string | null; status: string | null
    cliente_id: number | null; produto_id: number | null; vendedor_id: string | null
  }>

  // IDs únicos para joins
  const clienteIds = [...new Set(vendas.map(v => v.cliente_id).filter(Boolean))]
  const produtoIds  = [...new Set(vendas.map(v => v.produto_id).filter(Boolean))]
  const vendedorIds = [...new Set(vendas.map(v => v.vendedor_id).filter(Boolean))]

  const mesAtual = new Date().toISOString().slice(0, 7) // YYYY-MM

  const [
    { data: clientes },
    { data: produtos },
    { count: totalClientes },
    { count: leadsAtivos },
    { count: leadsNovos },
    { count: estoqueDisponivel },
    { count: assistenciasAbertas },
    { data: vendedoresRaw },
    { data: metasRaw },
  ] = await Promise.all([
    clienteIds.length
      ? supabase.from('clientes').select('id, nome').in('id', clienteIds)
      : Promise.resolve({ data: [] }),
    produtoIds.length
      ? supabase.from('produtos').select('id, nome').in('id', produtoIds)
      : Promise.resolve({ data: [] }),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('ativo', true).eq('kanban_status', 'novo'),
    supabase.from('inventario_unidades').select('*', { count: 'exact', head: true }).eq('status', 'disponivel').eq('ativo', true),
    supabase.from('garantias_assistencias').select('*', { count: 'exact', head: true }).not('status', 'in', '(concluida,cancelada)'),
    supabase.from('usuarios').select('id, nome'),
    supabase.from('metas_comissoes').select('usuario_id, meta_vendas_valor').eq('mes_ano', mesAtual),
  ])

  // Maps para lookup rápido
  const clienteMap = Object.fromEntries((clientes ?? []).map((c: { id: number; nome: string }) => [c.id, c.nome]))
  const produtoMap  = Object.fromEntries((produtos ?? []).map((p: { id: number; nome: string }) => [p.id, p.nome]))
  const vendedorMap = Object.fromEntries((vendedoresRaw ?? []).map((u: { id: string; nome: string }) => [u.id, u.nome]))
  const metaMap     = Object.fromEntries((metasRaw ?? []).map((m: { usuario_id: string; meta_vendas_valor: number }) => [m.usuario_id, m.meta_vendas_valor]))

  // KPIs por período (só concluídas)
  const concluidas = vendas.filter(v => v.status === 'concluida')
  const periods: Record<string, { receita: number; lucro: number; qtdVendas: number; ticketMedio: number }> = {}
  for (const [key, start] of Object.entries(starts)) {
    const startMs = start.getTime()
    const f = concluidas.filter(v => v.data_venda && new Date(v.data_venda).getTime() >= startMs)
    const receita = f.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
    const lucro   = f.reduce((s, v) => s + (Number(v.lucro) || 0), 0)
    const qtd     = f.length
    periods[key]  = { receita, lucro, qtdVendas: qtd, ticketMedio: qtd > 0 ? receita / qtd : 0 }
  }

  // Faturamento mensal 12 meses
  const monthlyMap: Record<string, number> = {}
  concluidas.forEach(v => {
    if (!v.data_venda) return
    const d = new Date(v.data_venda)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[k] = (monthlyMap[k] ?? 0) + (Number(v.valor_venda) || 0)
  })
  const faturamentoMensal = Object.entries(monthlyMap).map(([mes, total]) => ({ mes, total }))

  // Vendas recentes (últimas 6) com nomes
  const recentes = [...vendas]
    .sort((a, b) => new Date(b.data_venda ?? 0).getTime() - new Date(a.data_venda ?? 0).getTime())
    .slice(0, 6)
    .map(v => ({
      id: v.id,
      valor_venda: Number(v.valor_venda),
      data_venda: v.data_venda,
      canal_venda: v.canal_venda,
      forma_pagamento: v.forma_pagamento,
      status: v.status,
      cliente_nome: v.cliente_id ? (clienteMap[v.cliente_id] ?? null) : null,
      produto_nome:  v.produto_id  ? (produtoMap[v.produto_id]  ?? null) : null,
    }))

  // Top vendedores do mês com meta
  const inicioMes = starts.mes.getTime()
  const vendasMes = concluidas.filter(v => v.data_venda && new Date(v.data_venda).getTime() >= inicioMes)
  const vendedorStats: Record<string, { nome: string; total: number; qtd: number; meta: number | null }> = {}

  // Incluir todos os usuários mesmo sem venda
  ;(vendedoresRaw ?? []).forEach((u: { id: string; nome: string }) => {
    vendedorStats[u.id] = { nome: u.nome, total: 0, qtd: 0, meta: metaMap[u.id] ?? null }
  })
  vendasMes.forEach(v => {
    if (!v.vendedor_id) return
    if (!vendedorStats[v.vendedor_id]) vendedorStats[v.vendedor_id] = { nome: vendedorMap[v.vendedor_id] ?? 'Vendedor', total: 0, qtd: 0, meta: null }
    vendedorStats[v.vendedor_id].total += Number(v.valor_venda) || 0
    vendedorStats[v.vendedor_id].qtd   += 1
  })

  const topVendedores = Object.entries(vendedorStats)
    .map(([id, s]) => ({ id, ...s }))
    .filter(v => v.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  return NextResponse.json({
    periods, faturamentoMensal,
    globais: {
      totalClientes: totalClientes ?? 0, leadsAtivos: leadsAtivos ?? 0,
      leadsNovos: leadsNovos ?? 0, estoqueDisponivel: estoqueDisponivel ?? 0,
      assistenciasAbertas: assistenciasAbertas ?? 0,
    },
    vendasRecentes: recentes,
    topVendedores,
  })
}
