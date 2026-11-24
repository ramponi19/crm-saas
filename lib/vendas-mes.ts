/**
 * EM QUE MÊS UMA VENDA CONCLUÍDA CONTA (hotfix H1, 24/11/2026).
 *
 * Até o hotfix, concluir uma encomenda sobrescrevia `data_venda` com a data da entrega — e era assim que a
 * comissão contava "no mês da entrega". A migração 20261125000100 separou as duas datas:
 *   - `data_venda`   quando a venda foi lançada (não muda mais);
 *   - `concluida_em` quando ela foi concluída com o dinheiro conferido (concluir_encomenda / concluir_venda_pdv).
 *
 * Quem precisa do mês da CONCLUSÃO usa este filtro: `coalesce(concluida_em, data_venda)` dentro do período.
 * As vendas anteriores ao hotfix não têm `concluida_em` e já têm `data_venda` = data da entrega (o código
 * antigo sobrescrevia), então o resultado delas não muda.
 *
 * Devolve a expressão para `.or(...)` do supabase-js (PostgREST não tem coalesce no filtro).
 */
export function filtroConcluidaNoPeriodo(inicioIso: string, fimIso: string): string {
  const q = (s: string) => `"${s.replace(/"/g, '')}"`
  return [
    `and(concluida_em.gte.${q(inicioIso)},concluida_em.lt.${q(fimIso)})`,
    `and(concluida_em.is.null,data_venda.gte.${q(inicioIso)},data_venda.lt.${q(fimIso)})`,
  ].join(',')
}
