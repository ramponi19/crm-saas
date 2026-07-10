import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Motor de cadência (Sprint 2.1) — playbook de N toques + fila do dia.
 *
 * IMPORTANTE (Meta): a cadência NUNCA envia mensagem. Ela apenas AGENDA a
 * próxima ação (o vendedor executa na fila: liga, abre wa.me, etc.). Preserva
 * o fluxo de recebimento da Meta — mesma disciplina de lib/automacoes.
 */

// Cliente genérico (nomes de tabela dinâmicos). Escopo por empresa garantido
// por RLS (client autenticado) ou pelo empresa_id passado.
type Db = SupabaseClient

export interface PassoMin { ordem: number; dia_offset: number }
export interface LeadMinC { id: number; responsavel_id: string | null }

/** Data da ação de um passo = data da inscrição + dia_offset dias. */
export function dataDaAcao(inscricaoIso: string, diaOffset: number): string {
  const base = new Date(inscricaoIso)
  base.setDate(base.getDate() + (diaOffset || 0))
  return base.toISOString()
}

/** Próximo passo após `ordemAtual` (menor ordem estritamente maior). */
export function proximoPasso<T extends PassoMin>(passos: T[], ordemAtual: number): T | null {
  const futuros = passos.filter((p) => p.ordem > ordemAtual).sort((a, b) => a.ordem - b.ordem)
  return futuros[0] ?? null
}

/** Inscreve o lead nas cadências com gatilho de entrada na etapa `etapaSlug`. */
export async function inscreverPorEtapa(db: Db, empresaId: number, lead: LeadMinC, etapaSlug: string) {
  const { data: cads } = await db.from('cadencias')
    .select('id, gatilho_etapa_slug')
    .eq('empresa_id', empresaId).eq('ativo', true).eq('gatilho', 'entrou_etapa')

  for (const c of (cads ?? []) as { id: number; gatilho_etapa_slug: string | null }[]) {
    if (c.gatilho_etapa_slug && c.gatilho_etapa_slug !== etapaSlug) continue

    const { data: passos } = await db.from('cadencia_passos')
      .select('ordem, dia_offset').eq('cadencia_id', c.id).order('ordem', { ascending: true }).limit(1)
    const primeiro = (passos?.[0] as PassoMin | undefined)
    if (!primeiro) continue

    // Já inscrito e ativo? (o índice único também protege, mas evitamos o erro.)
    const { data: existe } = await db.from('cadencia_inscricoes')
      .select('id').eq('cadencia_id', c.id).eq('lead_id', lead.id).eq('status', 'ativa').maybeSingle()
    if (existe) continue

    const nowIso = new Date().toISOString()
    await db.from('cadencia_inscricoes').insert({
      empresa_id: empresaId, cadencia_id: c.id, lead_id: lead.id, responsavel_id: lead.responsavel_id,
      status: 'ativa', passo_ordem: primeiro.ordem, proxima_acao_em: dataDaAcao(nowIso, primeiro.dia_offset),
    })
  }
}
