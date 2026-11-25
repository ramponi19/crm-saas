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

/** Mesmo critério, desde `inicioIso` sem fim (o painel busca 12 meses até agora; o Financeiro, o mês corrente). */
export function filtroConcluidaDesde(inicioIso: string): string {
  const q = (s: string) => `"${s.replace(/"/g, '')}"`
  return [
    `concluida_em.gte.${q(inicioIso)}`,
    `and(concluida_em.is.null,data_venda.gte.${q(inicioIso)})`,
  ].join(',')
}

/**
 * A data que põe a venda num dia ou mês do faturamento: `concluida_em ?? data_venda`.
 * Encomenda lançada em outubro e entregue em novembro é faturamento de NOVEMBRO.
 */
export function dataDaConclusao(v: { concluida_em?: string | null; data_venda?: string | null }): string | null {
  return v.concluida_em || v.data_venda || null
}

/**
 * O QUE ESTÁ EM ABERTO (encomenda e pendente de entrega) — fora do faturamento.
 *
 * Não é venda feita: o dinheiro todo ainda não entrou e o produto não saiu. O painel e os relatórios
 * mostram à parte, para o dono ver quanto já tem comprometido sem inflar o mês.
 *   - `pedidos`: um fechamento do PDV com 3 itens são 3 linhas com o mesmo `grupo_pdv` — conta 1;
 *   - `sinal`: soma do que já foi pago (vendas_pagamentos). O pagamento fica gravado só na primeira linha
 *     do fechamento, então somar as linhas não conta duas vezes;
 *   - `falta`: valor − sinal, nunca negativo.
 */
export interface LinhaEmAberto {
  id: number
  valor_venda: number | string | null
  status: string | null
  grupo_pdv?: string | null
  pagamentos?: { valor_pago: number | string | null }[] | null
}
export interface ResumoEmAberto { pedidos: number; valor: number; sinal: number; falta: number }

export const STATUS_EM_ABERTO = ['encomenda', 'pendente_entrega'] as const

export function resumoEmAberto(linhas: LinhaEmAberto[] | null | undefined): ResumoEmAberto {
  const abertas = (linhas ?? []).filter((v) => (STATUS_EM_ABERTO as readonly string[]).includes(v.status ?? ''))
  const pedidos = new Set(abertas.map((v) => v.grupo_pdv ?? `v${v.id}`)).size
  const valor = abertas.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
  const sinal = abertas.reduce((s, v) => s + (v.pagamentos ?? []).reduce((p, x) => p + (Number(x.valor_pago) || 0), 0), 0)
  const r = (n: number) => Math.round(n * 100) / 100
  return { pedidos, valor: r(valor), sinal: r(sinal), falta: r(Math.max(0, valor - sinal)) }
}
