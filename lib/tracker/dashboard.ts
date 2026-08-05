import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Métricas do Dashboard do Tracker — montadas a partir dos dados REAIS do crm-saas
 * (leads, lead_mensagens) cruzados com o rastreamento (visitas, eventos).
 * Read-only. Sem dados de investimento Meta ainda → CAC/ROAS ficam nulos.
 */
export interface TrackerDashboard {
  leadsRastreados: number
  totalLeads: number
  pctRastreado: number
  investimentoMeta: number | null
  cac: number | null
  roas: number | null
  eventosCapi: number
  conversas: number
  vendas: number
  faturamento: number
  taxaConversao: number
  origens: { origem: string; total: number }[]
  funil: { etapa: string; valor: number }[]
}

export async function calcularDashboard(empresaId: number, dias = 30): Promise<TrackerDashboard> {
  const db = rastrDb()
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const desdeDia = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
  const [
    { count: totalLeads },
    { data: leadsOrigem },
    { count: conversas },
    { data: visitas },
    { data: eventos },
    { data: investimentos },
  ] = await Promise.all([
    db.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).gte('created_at', desde),
    db.from('leads').select('origem').eq('empresa_id', empresaId).eq('ativo', true).gte('created_at', desde),
    db.from('lead_mensagens').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).gte('created_at', desde),
    db.from('rastreamento_visitas').select('id, lead_id').eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('rastreamento_eventos').select('tipo, valor, capi_status').eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('tracker_investimento').select('gasto').eq('empresa_id', empresaId).gte('dia', desdeDia),
  ])

  const vis = (visitas ?? []) as { id: number; lead_id: number | null }[]
  const evs = (eventos ?? []) as { tipo: string; valor: number | null; capi_status: string }[]

  const leadsRastreados = new Set(vis.filter((v) => v.lead_id).map((v) => v.lead_id)).size
  const eventosCapi = evs.filter((e) => e.capi_status === 'enviado').length
  const vendasEv = evs.filter((e) => e.tipo === 'purchase')
  const vendas = vendasEv.length
  const faturamento = vendasEv.reduce((s, e) => s + (Number(e.valor) || 0), 0)
  const total = totalLeads ?? 0

  // Origem das conversas (dados reais do CRM).
  const oMap = new Map<string, number>()
  for (const l of (leadsOrigem ?? []) as { origem: string | null }[]) {
    const o = l.origem || 'manual'
    oMap.set(o, (oMap.get(o) ?? 0) + 1)
  }
  const origens = [...oMap.entries()].map(([origem, t]) => ({ origem, total: t })).sort((a, b) => b.total - a.total).slice(0, 8)

  // Investimento no período (entrada manual ou Meta). Null se nada lançado.
  const somaInvest = ((investimentos ?? []) as { gasto: number | null }[]).reduce((s, i) => s + (Number(i.gasto) || 0), 0)
  const investimentoMeta: number | null = somaInvest > 0 ? somaInvest : null

  return {
    leadsRastreados,
    totalLeads: total,
    pctRastreado: total ? Math.round((leadsRastreados / total) * 1000) / 10 : 0,
    investimentoMeta,
    cac: investimentoMeta && vendas ? Math.round((investimentoMeta / vendas) * 100) / 100 : null,
    roas: investimentoMeta ? Math.round((faturamento / investimentoMeta) * 100) / 100 : null,
    eventosCapi,
    conversas: conversas ?? 0,
    vendas,
    faturamento,
    taxaConversao: leadsRastreados ? Math.round((vendas / leadsRastreados) * 1000) / 10 : 0,
    origens,
    funil: [
      { etapa: 'Visitas', valor: vis.length },
      { etapa: 'Leads rastreados', valor: leadsRastreados },
      { etapa: 'Vendas', valor: vendas },
    ],
  }
}
