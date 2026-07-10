import type { SupabaseClient } from '@supabase/supabase-js'
import { proximoResponsavel } from '@/lib/roleta'

/**
 * Motor de distribuição de leads (Sprint 2.2).
 *
 * Avalia regras ordenadas; a primeira cujo critério "bate" com o lead
 * distribui em rodízio entre seus destinatários. SEM regras ativas, cai na
 * roleta geral (comportamento atual — não regride). Meta-safe: só define o
 * dono interno do lead; nada é enviado a canais.
 */

type Db = SupabaseClient

export interface LeadLike { origem?: string | null; valor_estimado?: number | null }
interface RegraRow { id: number; criterio: string; config: Record<string, unknown>; destinatarios: string[]; rodizio_ptr: number }

function criterioBate(r: RegraRow, lead: LeadLike): boolean {
  if (r.criterio === 'qualquer') return true
  if (r.criterio === 'origem') {
    const valores = (((r.config?.valores as string[]) ?? [])).map((v) => String(v).toLowerCase().trim())
    const o = (lead.origem ?? '').toLowerCase().trim()
    return !!o && valores.includes(o)
  }
  if (r.criterio === 'faixa_valor') {
    const v = Number(lead.valor_estimado ?? 0)
    const min = Number((r.config?.min as number) ?? 0)
    const max = Number((r.config?.max as number) ?? 0)
    return max > 0 ? v >= min && v <= max : v >= min
  }
  return false
}

/** Escolhe o responsável conforme as regras (persiste o ponteiro do rodízio). */
export async function escolherResponsavel(svc: Db, empresaId: number, lead: LeadLike): Promise<string | null> {
  const { data: regras } = await svc.from('distribuicao_regras')
    .select('id, criterio, config, destinatarios, rodizio_ptr')
    .eq('empresa_id', empresaId).eq('ativo', true).order('ordem', { ascending: true })

  if (!regras || regras.length === 0) return proximoResponsavel(svc as never, empresaId)

  for (const raw of regras as unknown as RegraRow[]) {
    if (!criterioBate(raw, lead)) continue
    const dests = Array.isArray(raw.destinatarios) ? (raw.destinatarios as string[]) : []
    if (dests.length === 0) {
      const geral = await proximoResponsavel(svc as never, empresaId)
      if (geral) return geral
      continue
    }
    const ptr = raw.rodizio_ptr ?? 0
    const idx = ((ptr % dests.length) + dests.length) % dests.length
    await svc.from('distribuicao_regras').update({ rodizio_ptr: ptr + 1 }).eq('id', raw.id)
    return dests[idx]
  }
  return null
}

/** Atribui um lead JÁ existente (esteira/Meta) e registra em lead_atribuicoes. */
export async function distribuirExistente(
  svc: Db, empresaId: number,
  lead: { id: number; origem?: string | null; valor_estimado?: number | null; responsavel_id?: string | null },
): Promise<string | null> {
  if (lead.responsavel_id) return lead.responsavel_id
  const escolhido = await escolherResponsavel(svc, empresaId, lead)
  if (!escolhido) return null
  await svc.from('leads').update({ responsavel_id: escolhido }).eq('id', lead.id)
  await svc.from('lead_atribuicoes').insert({
    empresa_id: empresaId, lead_id: lead.id, de_responsavel: null, para_responsavel: escolhido, por_usuario: null, acao: 'distribuir',
  })
  return escolhido
}
