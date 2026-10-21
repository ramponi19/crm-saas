import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { escopoDoUsuario } from '@/lib/escopo'
import {
  vendasDesde, vendasRecentes, contagensDoPainel, equipeEMetas,
  resultadoDasVendas, concluidas, inicioDosPeriodos, type ResultadoVendas,
} from '@/lib/painel/metricas'

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
   * Desde a etapa 0 as duas leem as mesmas consultas, de `lib/painel/metricas.ts`.
   */
  const escopo = await escopoDoUsuario(supabase, empresaId)

  const starts = inicioDosPeriodos()
  const inicio12m = new Date()
  inicio12m.setMonth(inicio12m.getMonth() - 12)
  inicio12m.setDate(1); inicio12m.setHours(0, 0, 0, 0)

  const mesAtual = new Date().toISOString().slice(0, 7) // YYYY-MM

  const [vendas, recentes, contagens, { vendedores, metaPorUsuario }] = await Promise.all([
    vendasDesde(supabase, empresaId, escopo, inicio12m),
    vendasRecentes(supabase, empresaId, escopo, 6),
    contagensDoPainel(supabase, empresaId, escopo),
    equipeEMetas(supabase, empresaId, mesAtual),
  ])

  // KPIs por período (só concluídas). Lucro e margem só onde há custo lançado.
  const fechadas = concluidas(vendas)
  const periods: Record<string, ResultadoVendas> = {}
  for (const [key, start] of Object.entries(starts)) {
    const startMs = start.getTime()
    periods[key] = resultadoDasVendas(fechadas.filter(v => v.data_venda && new Date(v.data_venda).getTime() >= startMs))
  }

  // Faturamento mensal 12 meses
  const monthlyMap: Record<string, number> = {}
  fechadas.forEach(v => {
    if (!v.data_venda) return
    const d = new Date(v.data_venda)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[k] = (monthlyMap[k] ?? 0) + v.valor_venda
  })
  const faturamentoMensal = Object.entries(monthlyMap).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))

  // Top vendedores do mês com meta
  const inicioMes = starts.mes.getTime()
  const vendasMes = fechadas.filter(v => v.data_venda && new Date(v.data_venda).getTime() >= inicioMes)
  const vendedorMap = Object.fromEntries(vendedores.map((u) => [u.id, u.nome]))
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
  ;paraRanking.forEach((u) => {
    vendedorStats[u.id] = { nome: u.nome, total: 0, qtd: 0, meta: metaPorUsuario[u.id] ?? null }
  })
  vendasMes.forEach(v => {
    if (!v.vendedor_id) return
    if (!vendedorStats[v.vendedor_id]) vendedorStats[v.vendedor_id] = { nome: vendedorMap[v.vendedor_id] ?? 'Vendedor', total: 0, qtd: 0, meta: null }
    vendedorStats[v.vendedor_id].total += v.valor_venda
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
  for (const v of fechadas) { const c = v.canal_venda ?? 'loja_fisica'; porCanal[c] = (porCanal[c] ?? 0) + 1 }

  const { funil: _funil, ...globais } = contagens
  return NextResponse.json({
    periods, faturamentoMensal, porCanal, globais,
    vendasRecentes: recentes,
    topVendedores,
  })
}
