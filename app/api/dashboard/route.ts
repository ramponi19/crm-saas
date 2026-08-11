import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { escopoDoUsuario, aplicarEscopo } from '@/lib/escopo'

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

  // Isolamento explícito por empresa (defesa em profundidade — o RLS também
  // aplica o escopo, mas mantemos o filtro consistente com o resto do app).
  const empresaId = await getEmpresaId()

  /**
   * ESCOPO POR USUÁRIO. Esta rota é a que a tela realmente usa: o dashboard
   * renderiza os números do servidor e, no navegador, chama /api/dashboard e
   * SOBRESCREVE tudo. Enquanto só a página estava escopada, o vendedor via o
   * faturamento da loja inteira — a correção estava no lugar que não aparece.
   *
   * Mesma lição do resto do app: dado calculado em dois lugares precisa da
   * mesma regra nos dois, ou o que vale é sempre o que você esqueceu.
   */
  const escopo = await escopoDoUsuario(supabase, empresaId)

  const starts = getPeriodStarts()
  const inicio12m = new Date()
  inicio12m.setMonth(inicio12m.getMonth() - 12)
  inicio12m.setDate(1); inicio12m.setHours(0, 0, 0, 0)

  // Vendas do ano com cliente e produto via inventario_unidades
  const { data: vendasRaw } = await aplicarEscopo(
    supabase
      .from('vendas')
      .select('id, valor_venda, lucro, data_venda, canal_venda, forma_pagamento, status, cliente_id, vendedor_id, produtos!produto_id(nome)')
      .eq('empresa_id', empresaId)
      .not('status', 'in', '("encomenda","pendente_entrega")')
      .gte('data_venda', inicio12m.toISOString()),
    escopo, 'vendedor_id',
  )

  type VendaRow = {
    id: number; valor_venda: number; lucro: number | null; data_venda: string | null
    canal_venda: string | null; forma_pagamento: string | null; status: string | null
    cliente_id: number | null; vendedor_id: string | null
    produtos: { nome: string | null } | { nome: string | null }[] | null
  }
  const vendas = ((vendasRaw ?? []) as unknown as VendaRow[]).map(v => ({
    id: v.id,
    valor_venda: v.valor_venda,
    lucro: v.lucro,
    data_venda: v.data_venda,
    canal_venda: v.canal_venda,
    forma_pagamento: v.forma_pagamento,
    status: v.status,
    cliente_id: v.cliente_id,
    vendedor_id: v.vendedor_id,
    produto_nome: (Array.isArray(v.produtos) ? v.produtos[0]?.nome : v.produtos?.nome) ?? null,
  }))

  // IDs únicos para joins
  const clienteIds = [...new Set(vendas.map(v => v.cliente_id).filter((id): id is number => id != null))]

  const mesAtual = new Date().toISOString().slice(0, 7) // YYYY-MM

  const [
    { data: clientes },
    { count: totalClientes },
    { count: leadsAtivos },
    { count: leadsNovos },
    { count: estoqueDisponivel },
    { count: assistenciasAbertas },
    { data: vendedoresRaw },
    { data: metasRaw },
  ] = await Promise.all([
    clienteIds.length
      ? supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).in('id', clienteIds)
      : Promise.resolve({ data: [] }),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true),
    aplicarEscopo(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true), escopo, 'responsavel_id'),
    aplicarEscopo(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).eq('kanban_status', 'novo'), escopo, 'responsavel_id'),
    supabase.from('inventario_unidades').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'disponivel').eq('ativo', true),
    supabase.from('garantias_assistencias').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).not('status', 'in', '(concluido,entregue,cancelada,recusado,reprovado)'),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(id, nome)').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('metas_comissoes').select('usuario_id, meta_vendas_valor').eq('empresa_id', empresaId).eq('mes_ano', mesAtual),
  ])

  // Normaliza vendedores (vêm via empresa_usuarios -> usuarios)
  type EmpresaUsuarioRow = { usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null }
  const vendedores = ((vendedoresRaw ?? []) as unknown as EmpresaUsuarioRow[])
    .map(eu => (Array.isArray(eu.usuarios) ? eu.usuarios[0] : eu.usuarios))
    .filter((u): u is { id: string; nome: string } => Boolean(u?.id))

  // Maps para lookup rápido
  const clienteMap = Object.fromEntries((clientes ?? []).map((c: { id: number; nome: string }) => [c.id, c.nome]))
  const vendedorMap = Object.fromEntries(vendedores.map((u: { id: string; nome: string }) => [u.id, u.nome]))
  const metaMap     = Object.fromEntries((metasRaw ?? []).map((m: { usuario_id: string | null; meta_vendas_valor: number | null }) => [m.usuario_id, m.meta_vendas_valor]))

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
  const faturamentoMensal = Object.entries(monthlyMap).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))

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
      produto_nome: v.produto_nome ?? null,
    }))

  // Top vendedores do mês com meta
  const inicioMes = starts.mes.getTime()
  const vendasMes = concluidas.filter(v => v.data_venda && new Date(v.data_venda).getTime() >= inicioMes)
  const vendedorStats: Record<string, { nome: string; total: number; qtd: number; meta: number | null }> = {}

  /**
   * Quem não pode ver resultado de outros aparece SOZINHO neste bloco.
   *
   * Filtrar só as vendas não bastaria: a lista era montada a partir de todos os
   * usuários da empresa, então o vendedor continuaria vendo o nome e a meta dos
   * colegas (com total zerado, o que é pior — parece que ninguém vendeu).
   */
  const paraRanking = escopo.soMeu && escopo.userId
    ? vendedores.filter((u) => u.id === escopo.userId)
    : vendedores
  ;paraRanking.forEach((u: { id: string; nome: string }) => {
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

  // Distribuição por canal — só vendas concluídas (o donut antes usava as 6
  // recentes, incluindo canceladas/encomendas).
  const porCanal: Record<string, number> = {}
  for (const v of concluidas) { const c = v.canal_venda ?? 'loja_fisica'; porCanal[c] = (porCanal[c] ?? 0) + 1 }

  return NextResponse.json({
    periods, faturamentoMensal, porCanal,
    globais: {
      totalClientes: totalClientes ?? 0, leadsAtivos: leadsAtivos ?? 0,
      leadsNovos: leadsNovos ?? 0, estoqueDisponivel: estoqueDisponivel ?? 0,
      assistenciasAbertas: assistenciasAbertas ?? 0,
    },
    vendasRecentes: recentes,
    topVendedores,
  })
}
