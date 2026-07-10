import type { SupabaseClient } from '@supabase/supabase-js'
import { dataDaAcao } from '@/lib/cadencia'

/**
 * Re-aquecimento / win-back (Sprint 3.3). Recicla leads FRIOS (parados há N
 * dias) e, opcionalmente, PERDIDOS, inscrevendo-os numa cadência de reativação
 * (reusa o motor da 2.1). Assim o lead volta pra Fila do dia em vez de morrer
 * na etapa. Meta-safe: só agenda tarefas.
 */
type Db = SupabaseClient

export interface ReativacaoConfig { ativo?: boolean; dias_frio?: number; incluir_perdidos?: boolean; cadencia_id?: number | null }

export async function carregarReativacao(svc: Db, empresaId: number): Promise<ReativacaoConfig> {
  const { data } = await svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'reativacao').maybeSingle()
  return (data?.valor ?? {}) as ReativacaoConfig
}

export async function reativarFrios(svc: Db, empresaId: number): Promise<{ reativados: number }> {
  const cfg = await carregarReativacao(svc, empresaId)
  const cadenciaId = cfg.cadencia_id
  if (!cadenciaId) return { reativados: 0 }

  const dias = Math.max(1, Number(cfg.dias_frio) || 30)
  const corte = new Date(Date.now() - dias * 86400000).toISOString()

  const { data: passos } = await svc.from('cadencia_passos').select('ordem, dia_offset').eq('cadencia_id', cadenciaId).order('ordem', { ascending: true }).limit(1)
  const primeiro = passos?.[0] as { ordem: number; dia_offset: number } | undefined
  if (!primeiro) return { reativados: 0 }

  const { data: etapasPerd } = await svc.from('funil_etapas').select('slug').eq('empresa_id', empresaId).eq('tipo', 'perdido')
  const perdidoSlugs = new Set((etapasPerd ?? []).map((e) => e.slug))

  const { data: leads } = await svc.from('leads')
    .select('id, responsavel_id, kanban_status, ultima_tratativa, ultima_mensagem_at, created_at, perdido_em, ativo')
    .eq('empresa_id', empresaId).limit(3000)

  const candidatos = new Map<number, string | null>()
  for (const l of (leads ?? []) as Array<{ id: number; responsavel_id: string | null; kanban_status: string | null; ultima_tratativa: string | null; ultima_mensagem_at: string | null; created_at: string | null; perdido_em: string | null; ativo: boolean | null }>) {
    const perdido = l.perdido_em != null || perdidoSlugs.has(l.kanban_status ?? '')
    if (perdido) { if (cfg.incluir_perdidos) candidatos.set(l.id, l.responsavel_id); continue }
    if (l.ativo === false) continue
    const ultAtiv = l.ultima_tratativa ?? l.ultima_mensagem_at ?? l.created_at
    if (!ultAtiv || ultAtiv < corte) candidatos.set(l.id, l.responsavel_id) // frio (ou sem atividade)
  }
  if (candidatos.size === 0) return { reativados: 0 }

  const ids = [...candidatos.keys()]
  const { data: ativas } = await svc.from('cadencia_inscricoes').select('lead_id').eq('cadencia_id', cadenciaId).eq('status', 'ativa').in('lead_id', ids)
  const jaAtivas = new Set((ativas ?? []).map((a) => a.lead_id))

  let reativados = 0
  const nowIso = new Date().toISOString()
  for (const [id, responsavel] of candidatos) {
    if (jaAtivas.has(id)) continue
    const { error } = await svc.from('cadencia_inscricoes').insert({
      empresa_id: empresaId, cadencia_id: cadenciaId, lead_id: id, responsavel_id: responsavel,
      status: 'ativa', passo_ordem: primeiro.ordem, proxima_acao_em: dataDaAcao(nowIso, primeiro.dia_offset),
    })
    if (!error) reativados++
  }
  return { reativados }
}
