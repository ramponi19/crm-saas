import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Atribuição: a ponte entre a visita rastreada (clique no anúncio) e o lead do
 * WhatsApp. O pixel carimba ` [@<8hex do tracking_id>]` no texto do wa.me; a
 * mensagem chega ao webhook com esse marcador, e é por ele que reencontramos a
 * visita — e com ela o fbclid/UTM/campanha do anúncio.
 *
 * A reconciliação em si roda na Edge Function webhook-leads (Deno). Aqui ficam
 * os helpers do lado do app (Next) e o cálculo das métricas do painel.
 */

export const MARCADOR_RE = /\[@([A-Za-z0-9]{6,16})\]/

/** Extrai o código do visitante de um texto (ou null). */
export function extrairVisitorCode(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = texto.match(MARCADOR_RE)
  return m ? m[1].toLowerCase() : null
}

/** Remove o marcador do texto para não poluir a conversa exibida. */
export function limparMarcador(texto: string): string {
  return texto.replace(/\s*\[@[A-Za-z0-9]{6,16}\]\s*/g, ' ').trim()
}

export interface MetricasRastreamento {
  visitas: number
  leadsRastreados: number
  totalLeads: number
  pctRastreado: number
  eventosCapi: number
  vendas: number
  faturamento: number
  taxaConversao: number
  porCampanha: { campanha: string; visitas: number; leads: number; vendas: number; valor: number }[]
  porOrigem: { origem: string; visitas: number }[]
}

/**
 * Métricas de rastreamento da empresa na janela informada (dias).
 * Read-only. Usa o service client (rastrDb) para agregar visitas/eventos.
 */
export async function calcularMetricasRastreamento(
  db: SupabaseClient,
  empresaId: number,
  dias = 30,
): Promise<MetricasRastreamento> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const [{ data: visitasRaw }, { data: eventosRaw }, { count: totalLeads }] = await Promise.all([
    db.from('rastreamento_visitas')
      .select('id, lead_id, utm_campaign, utm_source')
      .eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('rastreamento_eventos')
      .select('id, tipo, valor, capi_status, visita_id')
      .eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('ativo', true).gte('created_at', desde),
  ])

  type V = { id: number; lead_id: number | null; utm_campaign: string | null; utm_source: string | null }
  type E = { id: number; tipo: string; valor: number | null; capi_status: string; visita_id: number | null }
  const visitas = (visitasRaw ?? []) as V[]
  const eventos = (eventosRaw ?? []) as E[]

  const leadsRastreados = new Set(visitas.filter((v) => v.lead_id).map((v) => v.lead_id)).size
  const eventosCapi = eventos.filter((e) => e.capi_status === 'enviado').length
  const vendasEv = eventos.filter((e) => e.tipo === 'purchase')
  const vendas = vendasEv.length
  const faturamento = vendasEv.reduce((s, e) => s + (Number(e.valor) || 0), 0)

  // Campanha por visita → agrega leads/vendas via visita_id dos eventos.
  const campVisita = new Map<number, string>()
  const campAgg = new Map<string, { visitas: number; leads: Set<number>; vendas: number; valor: number }>()
  const origemAgg = new Map<string, number>()
  for (const v of visitas) {
    const c = v.utm_campaign || '(sem campanha)'
    campVisita.set(v.id, c)
    const a = campAgg.get(c) ?? { visitas: 0, leads: new Set<number>(), vendas: 0, valor: 0 }
    a.visitas++
    if (v.lead_id) a.leads.add(v.lead_id)
    campAgg.set(c, a)
    const o = v.utm_source || '(direto)'
    origemAgg.set(o, (origemAgg.get(o) ?? 0) + 1)
  }
  for (const e of vendasEv) {
    if (e.visita_id == null) continue
    const c = campVisita.get(e.visita_id)
    if (!c) continue
    const a = campAgg.get(c)!
    a.vendas++
    a.valor += Number(e.valor) || 0
  }

  const porCampanha = [...campAgg.entries()]
    .map(([campanha, a]) => ({ campanha, visitas: a.visitas, leads: a.leads.size, vendas: a.vendas, valor: a.valor }))
    .sort((x, y) => y.visitas - x.visitas)
    .slice(0, 12)
  const porOrigem = [...origemAgg.entries()]
    .map(([origem, v]) => ({ origem, visitas: v }))
    .sort((x, y) => y.visitas - x.visitas)
    .slice(0, 8)

  return {
    visitas: visitas.length,
    leadsRastreados,
    totalLeads: totalLeads ?? 0,
    pctRastreado: totalLeads ? Math.round((leadsRastreados / totalLeads) * 1000) / 10 : 0,
    eventosCapi,
    vendas,
    faturamento,
    taxaConversao: leadsRastreados ? Math.round((vendas / leadsRastreados) * 1000) / 10 : 0,
    porCampanha,
    porOrigem,
  }
}
