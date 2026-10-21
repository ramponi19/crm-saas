import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { DashboardView } from '@/components/modules/dashboard/dashboard-view'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { escopoDoUsuario } from '@/lib/escopo'
import { vendasDesde, vendasRecentes, contagensDoPainel, resultadoDasVendas, concluidas, inicioDosPeriodos } from '@/lib/painel/metricas'
import DashboardImob from './dashboard-imob'

export const metadata = { title: 'Dashboard' }

async function getDashboardData() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  /**
   * O dashboard mostrava o faturamento, o lucro e o ticket da EMPRESA INTEIRA
   * para qualquer um que entrasse — inclusive o vendedor. Agora, sem a
   * permissão "ver vendas e resultados de outros", cada um vê o próprio número.
   *
   * As consultas (e o escopo de cada uma) estão em `lib/painel/metricas.ts`,
   * as mesmas que `/api/dashboard` usa.
   */
  const escopo = await escopoDoUsuario(supabase, empresaId)

  const [vendasDoMes, recentes, contagens] = await Promise.all([
    vendasDesde(supabase, empresaId, escopo, inicioDosPeriodos().mes),
    vendasRecentes(supabase, empresaId, escopo, 6),
    contagensDoPainel(supabase, empresaId, escopo),
  ])
  const vendasMes = concluidas(vendasDoMes)

  const produtoCount: Record<string, number> = {}
  for (const v of vendasMes) if (v.produto_nome) produtoCount[v.produto_nome] = (produtoCount[v.produto_nome] ?? 0) + 1
  const topProdutos = Object.entries(produtoCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([nome, qtd]) => ({ nome, qtd }))

  // Distribuição por canal (donut) — só vendas concluídas do mês.
  const porCanal: Record<string, number> = {}
  for (const v of vendasMes) { const c = v.canal_venda ?? 'loja_fisica'; porCanal[c] = (porCanal[c] ?? 0) + 1 }

  const { funil, ...globais } = contagens
  return {
    kpis: { mes: resultadoDasVendas(vendasMes), ...globais },
    vendasRecentes: recentes,
    leadsRecentes: [],
    topProdutos,
    porCanal,
    funilLeads: funil,
  }
}

export default async function DashboardPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  // `maybeSingle`: empresa ausente cai no dashboard padrão em vez de lançar.
  const { data: empresa } = await supabase.from('empresas').select('segmento:preset_onboarding').eq('id', empresaId).maybeSingle()
  // `telasProprias`: a vertical tem dashboard próprio. Concessionária vai querer
  // o dela, e aí liga a capacidade em vez de acrescentar outro `if` aqui.
  if (SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades.telasProprias) {
    return <DashboardImob />
  }
  const data = await getDashboardData()
  return <DashboardView data={data} />
}
