import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularScore, mergeScoreConfig, type ScoreConfig } from '@/lib/lead-score'
import { dataDaAcao } from '@/lib/cadencia'

/**
 * Reavaliação de scores no servidor (Sprint 2.3). Recalcula o score dos leads
 * ativos com engajamento REAL (nº de chamadas) e, quando o score cruza o
 * threshold configurado, inscreve o lead na cadência-gatilho. Meta-safe:
 * inscrição só agenda tarefas; nada é enviado a canais.
 * Roda no cron diário (decaimento de recência) e no botão "Reavaliar agora".
 */
type Db = SupabaseClient

async function carregarConfig(svc: Db, empresaId: number): Promise<ScoreConfig> {
  const { data } = await svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle()
  return mergeScoreConfig((data?.valor ?? null) as Partial<ScoreConfig> | null)
}

export async function reavaliarScores(svc: Db, empresaId: number): Promise<{ avaliados: number; enfileirados: number }> {
  const cfg = await carregarConfig(svc, empresaId)

  const { data: leads } = await svc.from('leads')
    .select('id, origem, valor_estimado, telefone, instagram, ultima_mensagem_at, ultima_tratativa, created_at, msgs_nao_lidas, primeira_msg, responsavel_id')
    .eq('empresa_id', empresaId).eq('ativo', true).limit(1000)
  if (!leads?.length) return { avaliados: 0, enfileirados: 0 }

  const ids = leads.map((l) => l.id)

  // Engajamento real: nº de chamadas registradas por lead.
  const { data: chamadas } = await svc.from('chamadas').select('lead_id').eq('empresa_id', empresaId).in('lead_id', ids)
  const contatos: Record<number, number> = {}
  for (const c of chamadas ?? []) if (c.lead_id != null) contatos[c.lead_id] = (contatos[c.lead_id] ?? 0) + 1

  const cadenciaId = cfg.gatilho.cadencia_id
  const gatilhoOn = cfg.gatilho.ativo && !!cadenciaId
  let primeiro: { ordem: number; dia_offset: number } | null = null
  const jaAtivas = new Set<number>()
  if (gatilhoOn && cadenciaId) {
    const { data: passos } = await svc.from('cadencia_passos').select('ordem, dia_offset').eq('cadencia_id', cadenciaId).order('ordem', { ascending: true }).limit(1)
    primeiro = (passos?.[0] as { ordem: number; dia_offset: number } | undefined) ?? null
    const { data: ativas } = await svc.from('cadencia_inscricoes').select('lead_id').eq('cadencia_id', cadenciaId).eq('status', 'ativa').in('lead_id', ids)
    for (const a of ativas ?? []) jaAtivas.add(a.lead_id)
  }

  let enfileirados = 0
  const nowIso = new Date().toISOString()
  for (const l of leads) {
    const { score } = calcularScore({ ...l, contatos: contatos[l.id] ?? 0 }, cfg)
    if (gatilhoOn && cadenciaId && primeiro && score >= cfg.gatilho.score_min && !jaAtivas.has(l.id)) {
      const { error } = await svc.from('cadencia_inscricoes').insert({
        empresa_id: empresaId, cadencia_id: cadenciaId, lead_id: l.id, responsavel_id: l.responsavel_id,
        status: 'ativa', passo_ordem: primeiro.ordem, proxima_acao_em: dataDaAcao(nowIso, primeiro.dia_offset),
      })
      if (!error) { enfileirados++; jaAtivas.add(l.id) }
    }
  }
  return { avaliados: leads.length, enfileirados }
}
