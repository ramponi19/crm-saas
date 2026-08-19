import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { escopoDoUsuario, aplicarEscopo } from '@/lib/escopo'
import DashboardImob from './dashboard-imob'

export const metadata = { title: 'Dashboard' }

async function getDashboardData() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  /**
   * O dashboard mostrava o faturamento, o lucro e o ticket da EMPRESA INTEIRA
   * para qualquer um que entrasse — inclusive o vendedor. Agora, sem a
   * permissão "ver vendas e resultados de outros", cada um vê o próprio número.
   *
   * ESTOQUE e ASSISTÊNCIAS continuam da loja: é operação compartilhada, não
   * resultado individual. Cliente também — cliente é da loja.
   */
  const escopo = await escopoDoUsuario(supabase, empresaId)
  const meu = <T extends { eq: (c: string, v: string) => T }>(q: T, coluna: string): T =>
    aplicarEscopo(q, escopo, coluna)

  const [
    { data: vendasMesRaw },
    { count: totalClientes },
    { count: leadsAtivos },
    { count: leadsNovos },
    { count: estoqueDisponivel },
    { count: assistenciasAbertas },
    { data: vendasRecentesRaw },
    { data: topProdutosRaw },
    { data: leadsFunilRaw },
  ] = await Promise.all([
    meu(supabase.from('vendas').select('*').eq('empresa_id', empresaId).gte('data_venda', startOfMonth.toISOString()).eq('status', 'concluida'), 'vendedor_id'),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true),
    meu(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true), 'responsavel_id'),
    meu(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).eq('kanban_status', 'novo'), 'responsavel_id'),
    supabase.from('inventario_unidades').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'disponivel').eq('ativo', true),
    supabase.from('garantias_assistencias').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).not('status', 'in', '(concluido,entregue,cancelada,recusado,reprovado)'),
    meu(supabase.from('vendas').select('id, valor_venda, forma_pagamento, canal_venda, data_venda, status, produtos!produto_id(nome)').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(5), 'vendedor_id'),
    meu(supabase.from('vendas')
      .select('produtos!produto_id(nome)')
      .eq('empresa_id', empresaId)
      .gte('data_venda', startOfMonth.toISOString())
      .eq('status', 'concluida')
      .limit(100), 'vendedor_id'),
    meu(supabase.from('leads').select('kanban_status').eq('empresa_id', empresaId).eq('ativo', true), 'responsavel_id'),
  ])

  const vendasMes = (vendasMesRaw ?? []) as Array<{ valor_venda: number; lucro: number | null; forma_pagamento: string | null; canal_venda: string | null; data_venda: string | null }>
  const relNome = (r: unknown): string | null => {
    const rel = Array.isArray(r) ? r[0] : r
    return (rel as { nome?: string | null } | null)?.nome ?? null
  }

  type VendaRecenteRow = {
    id: number; valor_venda: number; forma_pagamento: string | null
    canal_venda: string | null; data_venda: string | null; status: string | null
    produtos: unknown
  }
  const vendasRecentes = ((vendasRecentesRaw ?? []) as unknown as VendaRecenteRow[]).map(v => ({
    id: v.id,
    valor_venda: v.valor_venda,
    forma_pagamento: v.forma_pagamento,
    canal_venda: v.canal_venda,
    data_venda: v.data_venda,
    status: v.status,
    produto_nome: relNome(v.produtos),
  }))

  const produtoCount: Record<string, number> = {}
  ;((topProdutosRaw ?? []) as unknown as Array<{ produtos: unknown }>).forEach(v => {
    const nome = relNome(v.produtos)
    if (nome) produtoCount[nome] = (produtoCount[nome] ?? 0) + 1
  })
  const topProdutos = Object.entries(produtoCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([nome, qtd]) => ({ nome, qtd }))

  const funilCount: Record<string, number> = {}
  ;((leadsFunilRaw ?? []) as Array<{ kanban_status: string | null }>).forEach(l => {
    const s = l.kanban_status ?? 'novo'
    funilCount[s] = (funilCount[s] ?? 0) + 1
  })

  // Distribuição por canal (donut) — só vendas concluídas do mês.
  const porCanal: Record<string, number> = {}
  for (const v of vendasMes) { const c = v.canal_venda ?? 'loja_fisica'; porCanal[c] = (porCanal[c] ?? 0) + 1 }

  const receitaMes = vendasMes.reduce((sum, v) => sum + (Number(v.valor_venda) || 0), 0)
  const lucroMes = vendasMes.reduce((sum, v) => sum + (Number(v.lucro) || 0), 0)
  const qtdVendasMes = vendasMes.length
  const ticketMedio = qtdVendasMes > 0 ? receitaMes / qtdVendasMes : 0

  return {
    kpis: {
      receitaMes, lucroMes, qtdVendasMes, ticketMedio,
      totalClientes: totalClientes ?? 0,
      leadsAtivos: leadsAtivos ?? 0,
      leadsNovos: leadsNovos ?? 0,
      estoqueDisponivel: estoqueDisponivel ?? 0,
      assistenciasAbertas: assistenciasAbertas ?? 0,
    },
    vendasRecentes,
    leadsRecentes: [],
    topProdutos,
    porCanal,
    funilLeads: {
      novo: funilCount['novo'] ?? 0,
      em_contato: funilCount['em_contato'] ?? 0,
      negociando: funilCount['negociando'] ?? 0,
      convertido: funilCount['convertido'] ?? 0,
      perdido: funilCount['perdido'] ?? 0,
    },
  }
}

export default async function DashboardPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  // `maybeSingle`: empresa ausente cai no dashboard padrão em vez de lançar.
  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle()
  // `telasProprias`: a vertical tem dashboard próprio. Concessionária vai querer
  // o dela, e aí liga a capacidade em vez de acrescentar outro `if` aqui.
  if (SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades.telasProprias) {
    return <DashboardImob />
  }
  const data = await getDashboardData()
  return <DashboardView data={data} />
}
