import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ranking gamificado (Sprint 3.1) — métricas por vendedor no período + score.
 * Generaliza o ranking que existia só no relatório imob (5.2.b) para todos os
 * segmentos. Score = captações×1 + visitas×2 + propostas×3 + vendas×5.
 */
type Db = SupabaseClient

export interface LinhaRanking {
  usuario_id: string
  nome: string
  vendas: number
  faturamento: number
  captacoes: number
  visitas: number
  propostas: number
  conversao: number
  score: number
}

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export function janelaDoPeriodo(periodo: string): { ini: string; fim: string } {
  const [ano, mes] = periodo.split('-').map(Number)
  return { ini: new Date(ano, mes - 1, 1).toISOString(), fim: new Date(ano, mes, 1).toISOString() }
}

export async function calcularRanking(db: Db, empresaId: number, periodo: string): Promise<LinhaRanking[]> {
  const { ini, fim } = janelaDoPeriodo(periodo)

  const [{ data: membrosRaw }, { data: vendas }, { data: visitas }, { data: leads }, { data: propostas }] = await Promise.all([
    db.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    db.from('vendas').select('vendedor_id, valor_venda, data_venda, status').eq('empresa_id', empresaId).gte('data_venda', ini).lt('data_venda', fim),
    db.from('visitas').select('corretor_id, status, data_hora').eq('empresa_id', empresaId).eq('status', 'realizada').gte('data_hora', ini).lt('data_hora', fim),
    db.from('leads').select('responsavel_id, created_at').eq('empresa_id', empresaId).gte('created_at', ini).lt('created_at', fim),
    db.from('propostas').select('lead_id, created_at').eq('empresa_id', empresaId).gte('created_at', ini).lt('created_at', fim),
  ])

  // Propostas → responsável (via lead), inclusive de leads criados antes do período.
  const propLeadIds = [...new Set(((propostas ?? []) as { lead_id: number | null }[]).map((p) => p.lead_id).filter((x): x is number => x != null))]
  const respByLead = new Map<number, string | null>()
  if (propLeadIds.length) {
    const { data: propLeads } = await db.from('leads').select('id, responsavel_id').in('id', propLeadIds)
    for (const l of (propLeads ?? []) as { id: number; responsavel_id: string | null }[]) respByLead.set(l.id, l.responsavel_id)
  }

  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const linhas = new Map<string, LinhaRanking>()
  for (const m of (membrosRaw ?? []) as unknown as MembroRow[]) {
    linhas.set(m.usuario_id, { usuario_id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—', vendas: 0, faturamento: 0, captacoes: 0, visitas: 0, propostas: 0, conversao: 0, score: 0 })
  }
  const get = (id: string | null) => (id ? linhas.get(id) : undefined)

  for (const v of (vendas ?? []) as { vendedor_id: string | null; valor_venda: number; status: string | null }[]) {
    if (v.status === 'cancelada' || v.status === 'encomenda' || v.status === 'pendente_entrega') continue
    const l = get(v.vendedor_id); if (!l) continue
    l.vendas += 1; l.faturamento += Number(v.valor_venda) || 0
  }
  for (const v of (visitas ?? []) as { corretor_id: string | null }[]) {
    const l = get(v.corretor_id); if (l) l.visitas += 1
  }
  for (const ld of (leads ?? []) as { responsavel_id: string | null }[]) {
    const l = get(ld.responsavel_id); if (l) l.captacoes += 1
  }
  for (const p of (propostas ?? []) as { lead_id: number | null }[]) {
    const l = get(p.lead_id != null ? respByLead.get(p.lead_id) ?? null : null); if (l) l.propostas += 1
  }

  for (const l of linhas.values()) {
    l.conversao = l.captacoes > 0 ? Math.round((l.vendas / l.captacoes) * 100) : 0
    l.score = l.captacoes * 1 + l.visitas * 2 + l.propostas * 3 + l.vendas * 5
  }

  return [...linhas.values()].sort((a, b) => b.score - a.score || b.faturamento - a.faturamento)
}

/** Valor realizado de uma métrica para uma linha (usado no progresso das metas). */
export function valorMetrica(linha: LinhaRanking | undefined, tipo: string): number {
  if (!linha) return 0
  switch (tipo) {
    case 'faturamento': return linha.faturamento
    case 'visitas': return linha.visitas
    case 'propostas': return linha.propostas
    case 'captacoes': return linha.captacoes
    case 'vendas': case 'fechamentos': default: return linha.vendas
  }
}
