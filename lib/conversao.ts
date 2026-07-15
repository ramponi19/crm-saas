import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Diagnóstico de conversão (Sprint 3.2).
 * - Funil etapa-a-etapa (pipeline ATUAL): quantos leads alcançaram cada etapa
 *   e a taxa de passagem entre elas; o menor passo é o gargalo.
 * - Tempo de 1º contato: da criação do lead até a 1ª ligação registrada, por
 *   vendedor e por canal (origem), na janela de 90 dias. Read-only, Meta-safe.
 */
type Db = SupabaseClient
type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export interface EtapaFunil { slug: string; label: string; naEtapa: number; alcancaram: number; taxa: number | null }
export interface RespVendedor { usuario_id: string; nome: string; leads: number; comContato: number; semContato: number; tempoMedioH: number | null }
export interface RespCanal { canal: string; leads: number; tempoMedioH: number | null }
export interface Conversao {
  funil: EtapaFunil[]
  gargaloSlug: string | null
  vendedores: RespVendedor[]
  canais: RespCanal[]
  semContatoTotal: number
  tempoMedioGeralH: number | null
  totalCohort: number
}

export async function calcularConversao(db: Db, empresaId: number): Promise<Conversao> {
  const janela = new Date(Date.now() - 90 * 86400000).toISOString()

  const [{ data: etapasRaw }, { data: leadsAll }, { data: cohortRaw }, { data: membrosRaw }] = await Promise.all([
    db.from('funil_etapas').select('slug, label, ordem, tipo').eq('empresa_id', empresaId).eq('ativo', true).order('ordem', { ascending: true }),
    db.from('leads').select('kanban_status, ativo').eq('empresa_id', empresaId),
    db.from('leads').select('id, responsavel_id, origem, created_at').eq('empresa_id', empresaId).gte('created_at', janela),
    db.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  // --- Funil (pipeline atual): etapas na ordem, exceto "perdido" (dropout). ---
  type EtapaRow = { slug: string; label: string; ordem: number; tipo: string | null }
  const etapas = ((etapasRaw ?? []) as EtapaRow[]).filter((e) => e.tipo !== 'perdido')
  // Dedup de slug (múltiplos funis podem repetir): mantém a 1ª ocorrência na ordem.
  const vistos = new Set<string>()
  const etapasUnicas = etapas.filter((e) => (vistos.has(e.slug) ? false : (vistos.add(e.slug), true)))

  const countPorSlug = new Map<string, number>()
  for (const l of (leadsAll ?? []) as { kanban_status: string | null; ativo: boolean | null }[]) {
    if (l.ativo === false) continue // não conta leads excluídos (alinha com o dashboard)
    const s = l.kanban_status ?? ''
    countPorSlug.set(s, (countPorSlug.get(s) ?? 0) + 1)
  }
  const naEtapa = etapasUnicas.map((e) => countPorSlug.get(e.slug) ?? 0)
  // alcançaram etapa i = soma de quem está em i ou além (etapas ordenadas).
  const alcancaram = naEtapa.map((_, i) => naEtapa.slice(i).reduce((a, b) => a + b, 0))

  const funil: EtapaFunil[] = etapasUnicas.map((e, i) => ({
    slug: e.slug, label: e.label, naEtapa: naEtapa[i], alcancaram: alcancaram[i],
    taxa: i === 0 ? null : (alcancaram[i - 1] > 0 ? Math.round((alcancaram[i] / alcancaram[i - 1]) * 100) : 0),
  }))
  // Gargalo = menor taxa de passagem (ignora a 1ª etapa, que não tem taxa).
  let gargaloSlug: string | null = null
  let menor = Infinity
  for (let i = 1; i < funil.length; i++) {
    if (funil[i].taxa != null && (funil[i].taxa as number) < menor) { menor = funil[i].taxa as number; gargaloSlug = funil[i].slug }
  }

  // --- Tempo de 1º contato (cohort 90d). Primeira chamada por lead. ---
  const cohort = (cohortRaw ?? []) as { id: number; responsavel_id: string | null; origem: string | null; created_at: string | null }[]
  const cohortIds = cohort.map((l) => l.id)
  const primeiraChamada = new Map<number, string>()
  if (cohortIds.length) {
    const { data: chamadas } = await db.from('chamadas').select('lead_id, created_at').eq('empresa_id', empresaId).in('lead_id', cohortIds).order('created_at', { ascending: true })
    for (const c of (chamadas ?? []) as { lead_id: number | null; created_at: string | null }[]) {
      if (c.lead_id != null && c.created_at && !primeiraChamada.has(c.lead_id)) primeiraChamada.set(c.lead_id, c.created_at)
    }
  }
  const horas = (ini: string, fim: string) => Math.max(0, (new Date(fim).getTime() - new Date(ini).getTime()) / 3600000)

  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const nomeById = new Map<string, string>()
  for (const m of (membrosRaw ?? []) as unknown as MembroRow[]) nomeById.set(m.usuario_id, one(m.usuarios)?.nome ?? '—')

  const vMap = new Map<string, { leads: number; tempos: number[]; sem: number }>()
  const cMap = new Map<string, { leads: number; tempos: number[] }>()
  let semContatoTotal = 0
  const temposGerais: number[] = []

  for (const l of cohort) {
    const rid = l.responsavel_id ?? '—'
    const canal = (l.origem ?? 'manual')
    const v = vMap.get(rid) ?? { leads: 0, tempos: [], sem: 0 }
    const c = cMap.get(canal) ?? { leads: 0, tempos: [] }
    v.leads++; c.leads++
    const pc = primeiraChamada.get(l.id)
    if (pc && l.created_at) { const h = horas(l.created_at, pc); v.tempos.push(h); c.tempos.push(h); temposGerais.push(h) }
    else { v.sem++; semContatoTotal++ }
    vMap.set(rid, v); cMap.set(canal, c)
  }
  const media = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null)

  const vendedores: RespVendedor[] = [...vMap.entries()].map(([id, v]) => ({
    usuario_id: id, nome: id === '—' ? 'Sem responsável' : (nomeById.get(id) ?? '—'),
    leads: v.leads, comContato: v.tempos.length, semContato: v.sem, tempoMedioH: media(v.tempos),
  })).sort((a, b) => (b.semContato - a.semContato) || ((b.tempoMedioH ?? 0) - (a.tempoMedioH ?? 0)))

  const canais: RespCanal[] = [...cMap.entries()].map(([canal, c]) => ({ canal, leads: c.leads, tempoMedioH: media(c.tempos) }))
    .sort((a, b) => (b.tempoMedioH ?? 0) - (a.tempoMedioH ?? 0))

  return { funil, gargaloSlug, vendedores, canais, semContatoTotal, tempoMedioGeralH: media(temposGerais), totalCohort: cohort.length }
}
