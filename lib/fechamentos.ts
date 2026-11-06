import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * FECHAMENTOS (ganhos e perdas) que não somem quando o negócio é reaberto (05/11/2026).
 *
 * Desde a regra "um card por contato por loja" (decisão do Matheus), o cliente que volta
 * depois de um ganho antigo ou de uma perda reabre o MESMO negócio: ele volta para a
 * primeira etapa e perde `status`, `ganho_em`, `perdido_em` e `motivo_perda_id`. Antes de
 * limpar, a `core_negocio_do_canal` grava o fechamento em `negocio_historico.detalhe`
 * (acao 'reaberto_por_mensagem'). Então todo fechamento é UM destes:
 *   - o estado ATUAL do negócio (status ganho/perdido, com a data e o motivo);
 *   - um 'reaberto_por_mensagem' com `detalhe.status` ganho/perdido (o ciclo anterior).
 * Um negócio que fechou, reabriu e fechou de novo conta duas vezes: são dois ciclos.
 * Desde 06/11/2026, também um 'fechamento_juntado': o negócio fechado que saiu do funil
 * na junção de negócios repetidos (lib/juntar-negocios.ts) deixa o fechamento no
 * histórico do negócio que ficou, e o status dele é limpo — conta uma vez, lá.
 * Venda e faturamento continuam contando por `vendas_vendas`.
 *
 * A RLS de quem chama vale: o histórico é lido junto com o negócio (`!inner`), então a
 * loja e o papel são os da sessão.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>
type Json = Record<string, unknown>

export interface Fechamento {
  negocio_id: number
  status: 'ganho' | 'perdido'
  /** ganho_em ou perdido_em do ciclo. */
  em: string | null
  motivo_perda_id: number | null
  valor_estimado: number | null
  responsavel_id: string | null
  filial_id: number | null
  contato_id: number
  /** true = ciclo anterior, guardado na reabertura. */
  reaberto: boolean
}

export interface FiltroFechamentos {
  status?: 'ganho' | 'perdido'
  /** ISO; compara com a data do fechamento (`em`). Sem data, o fechamento só entra sem filtro de período. */
  de?: string
  ate?: string
  /** Só negócios ativos (o "zerar do funil"), como as contagens do painel. */
  soAtivos?: boolean
  /** Só os ciclos reabertos (quem já conta o estado de hoje pela etapa não relê os atuais). */
  soReabertos?: boolean
}

/** Ações de `negocio_historico` que guardam um fechamento (status ganho/perdido no `detalhe`). */
export const ACOES_DE_FECHAMENTO = ['reaberto_por_mensagem', 'fechamento_juntado']

const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

async function paginar<T>(f: (de: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await f(de)
    if (error) throw new Error(`fechamentos: ${error.message}`)
    const lote = (data ?? []) as T[]
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

export async function lerFechamentos(db: Db, empresaId: number, filtro: FiltroFechamentos = {}): Promise<Fechamento[]> {
  const status = filtro.status ? [filtro.status] : ['ganho', 'perdido']

  const SELECT_ATUAL: string = 'id, status, ganho_em, perdido_em, motivo_perda_id, valor_estimado, responsavel_id, filial_id, contato_id, ativo'
  const atuais = filtro.soReabertos ? [] : await paginar<Json>((de) => {
    let q = db.from('negocios').select(SELECT_ATUAL).eq('empresa_id', empresaId).in('status', status)
    if (filtro.soAtivos) q = q.eq('ativo', true)
    return q.order('id').range(de, de + 999)
  })

  const SELECT_REAB: string = 'id, negocio_id, detalhe, em, negocio:negocios!negocio_id!inner(responsavel_id, filial_id, contato_id, ativo)'
  const reabertos = await paginar<Json>((de) => {
    let q = db.from('negocio_historico').select(SELECT_REAB).eq('empresa_id', empresaId)
      .in('acao', ACOES_DE_FECHAMENTO).in('detalhe->>status', status)
    if (filtro.soAtivos) q = q.eq('negocio.ativo', true)
    return q.order('id').range(de, de + 999)
  })

  const lista: Fechamento[] = [
    ...atuais.map((n) => ({
      negocio_id: n.id as number,
      status: n.status as 'ganho' | 'perdido',
      em: ((n.status === 'ganho' ? n.ganho_em : n.perdido_em) as string | null) ?? null,
      motivo_perda_id: (n.motivo_perda_id as number | null) ?? null,
      valor_estimado: n.valor_estimado == null ? null : Number(n.valor_estimado),
      responsavel_id: (n.responsavel_id as string | null) ?? null,
      filial_id: (n.filial_id as number | null) ?? null,
      contato_id: n.contato_id as number,
      reaberto: false,
    })),
    ...reabertos.map((h) => {
      const d = (h.detalhe ?? {}) as Json
      const n = (um(h.negocio as Json | Json[] | null) ?? {}) as Json
      const st = d.status as 'ganho' | 'perdido'
      return {
        negocio_id: h.negocio_id as number,
        status: st,
        em: ((st === 'ganho' ? d.ganho_em : d.perdido_em) as string | null) ?? null,
        motivo_perda_id: d.motivo_perda_id == null ? null : Number(d.motivo_perda_id),
        valor_estimado: d.valor_estimado == null ? null : Number(d.valor_estimado),
        // dono e loja de hoje: o histórico não guarda os de então
        responsavel_id: (n.responsavel_id as string | null) ?? null,
        filial_id: (n.filial_id as number | null) ?? null,
        contato_id: n.contato_id as number,
        reaberto: true,
      }
    }),
  ]
  return lista.filter((f) => (!filtro.de || (f.em != null && f.em >= filtro.de)) && (!filtro.ate || (f.em != null && f.em < filtro.ate)))
}

/** Quantos ganhos e perdas (atuais + reabertos), para os funis que contavam a etapa de hoje. */
export async function contarFechamentos(db: Db, empresaId: number, filtro: Omit<FiltroFechamentos, 'status'> = {}) {
  const todos = await lerFechamentos(db, empresaId, filtro)
  return {
    ganhos: todos.filter((f) => f.status === 'ganho').length,
    perdas: todos.filter((f) => f.status === 'perdido').length,
    reabertosGanhos: todos.filter((f) => f.status === 'ganho' && f.reaberto).length,
    reabertosPerdas: todos.filter((f) => f.status === 'perdido' && f.reaberto).length,
    todos,
  }
}
