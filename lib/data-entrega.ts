/**
 * DATA DE ENTREGA DE UMA VENDA (correção de 25/11/2026, depois do hotfix H1).
 *
 * Até o hotfix de 24/11, entregar uma encomenda sobrescrevia `data_venda` com a data da entrega. Desde a migração
 * 20261125000100 (`concluir_encomenda`), `data_venda` é a data do LANÇAMENTO e a entrega fica em `concluida_em`.
 * Tudo o que conta prazo a partir da entrega (garantia) ou imprime a data da entrega (termo de garantia, 2ª via
 * do contrato) usa esta função:
 *   1. `concluida_em` — quando a venda foi concluída/entregue com o dinheiro conferido;
 *   2. `data_venda`   — venda anterior ao hotfix (nela, `data_venda` já É a data da entrega/conclusão);
 *   3. `created_at`   — último recurso, registro sem nenhuma das duas.
 * O mesmo critério da comissão e do painel: coalesce(concluida_em, data_venda).
 */

export interface DatasDaVenda {
  concluida_em?: string | null
  data_venda?: string | null
  created_at?: string | null
}

export function dataDeEntrega(v: DatasDaVenda | null | undefined): string | null {
  if (!v) return null
  return v.concluida_em || v.data_venda || v.created_at || null
}

/** A venda entregue mais recentemente (por `dataDeEntrega`), entre várias do mesmo aparelho. */
export function maisRecentePorEntrega<T extends DatasDaVenda>(vendas: T[] | null | undefined): T | null {
  let melhor: T | null = null
  let melhorMs = -Infinity
  for (const v of vendas ?? []) {
    const d = dataDeEntrega(v)
    const ms = d ? new Date(d).getTime() : NaN
    if (Number.isFinite(ms) && ms > melhorMs) { melhor = v; melhorMs = ms }
  }
  return melhor
}

const DIA_MS = 86_400_000

/** Dias de garantia que restam, contando da entrega. Negativo = vencida. */
export function diasDeGarantiaRestantes(entrega: Date, diasTotal: number, hoje: Date): number {
  const passados = Math.floor((hoje.getTime() - entrega.getTime()) / DIA_MS)
  return diasTotal - passados
}
