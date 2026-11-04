/**
 * A REGRA DO SINO (04/11/2026, Inbox única) — pura, sem React nem banco, testada
 * em tests/inbox.test.ts. O hub de tempo real da aba (components/layout/
 * tempo-real-empresa.tsx) guarda um mapa das conversas com `nao_lidas > 0` e o
 * atualiza com cada evento de `conversas` que o Realtime entrega.
 */

export type LinhaConversa = {
  id: number
  contato_id: number | null
  canal_id: number | null
  filial_id: number | null
  nao_lidas: number
  ultima_mensagem_at: string | null
}

export type EventoConversa = {
  tabela: 'conversas'
  tipo: 'INSERT' | 'UPDATE' | 'DELETE'
  novo: LinhaConversa | null
  antigo: Partial<LinhaConversa> | null
}

/** Data como número: o Realtime e o PostgREST escrevem o mesmo instante em formatos diferentes. */
export const instante = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0)

/** A ordem do sino: a conversa que mexeu por último em cima. */
export function ordenarSino(linhas: Iterable<LinhaConversa>): LinhaConversa[] {
  return [...linhas].sort((a, b) => instante(b.ultima_mensagem_at) - instante(a.ultima_mensagem_at) || b.id - a.id)
}

/** Aplica um evento de `conversas` ao mapa do sino. Devolve se mudou algo. */
export function aplicarNoSino(mapa: Map<number, LinhaConversa>, e: EventoConversa): boolean {
  if (e.tipo === 'DELETE') {
    const id = e.antigo?.id
    return id != null && mapa.delete(id)
  }
  const n = e.novo
  if (!n) return false
  const antes = mapa.get(n.id)
  if ((n.nao_lidas ?? 0) > 0) {
    if (antes && antes.nao_lidas === n.nao_lidas && instante(antes.ultima_mensagem_at) === instante(n.ultima_mensagem_at)) return false
    mapa.set(n.id, { id: n.id, contato_id: n.contato_id, canal_id: n.canal_id, filial_id: n.filial_id, nao_lidas: n.nao_lidas, ultima_mensagem_at: n.ultima_mensagem_at })
    return true
  }
  return mapa.delete(n.id)
}
