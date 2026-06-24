import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'

export const metadata = { title: 'Dashboard' }

async function getDashboardData() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

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
    supabase.from('vendas').select('*').eq('empresa_id', empresaId).gte('data_venda', startOfMonth.toISOString()).eq('status', 'concluida'),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).eq('kanban_status', 'novo'),
    supabase.from('inventario_unidades').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'disponivel').eq('ativo', true),
    supabase.from('garantias_assistencias').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).not('status', 'in', '(concluida,cancelada)'),
    supabase.from('vendas').select('id, valor_venda, forma_pagamento, canal_venda, data_venda, status, produtos!produto_id(nome)').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(5),
    supabase.from('vendas')
      .select('produtos!produto_id(nome)')
      .eq('empresa_id', empresaId)
      .gte('data_venda', startOfMonth.toISOString())
      .eq('status', 'concluida')
      .limit(100),
    supabase.from('leads').select('kanban_status').eq('empresa_id', empresaId).eq('ativo', true),
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
  const data = await getDashboardData()
  return <DashboardView data={data} />
}
