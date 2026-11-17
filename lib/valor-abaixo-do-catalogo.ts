import { formatCurrency } from '@/lib/utils'

/**
 * VALOR MUITO ABAIXO DA REFERÊNCIA DO PRODUTO — aviso antes de salvar, sem bloquear (17/11/2026, pedido do Lucas).
 *
 * Uma encomenda real da JM entrou com R$ 7,60 num produto de mais de R$ 7 mil: um dígito fora do lugar que
 * ninguém viu. Desconto grande, brinde e preço combinado existem, então não é bloqueio: é uma pergunta com o
 * número na frente. Vale no PDV, na encomenda nova e no ajuste da encomenda em aberto.
 *
 * A REFERÊNCIA, nesta ordem:
 *   1. o preço do produto no catálogo (`estoque_produtos.preco`) — "Confirme o valor: R$ 7,60 para um produto
 *      de R$ 7.695,00 (preço do catálogo)";
 *   2. sem preço no catálogo, a MEDIANA das vendas do produto nos últimos 90 dias, só com pelo menos 5 vendas
 *      (a JM não tem preço em nenhum dos 35 produtos do catálogo; o preço dela mora na peça e no balcão) —
 *      "Confirme o valor: R$ 7,60 — referência: mediana das últimas 31 vendas: R$ 7.695".
 * Sem nenhuma das duas (produto novo, item digitado sem produto cadastrado), não há com o que comparar.
 */
export const FRACAO_MINIMA = 0.5
export const DIAS_DA_MEDIANA = 90
export const MINIMO_DE_VENDAS = 5

/** A mediana do valor de UMA peça nas vendas do produto. */
export interface MedianaVendas { valor: number; vendas: number }

/** A referência de um produto: `vendas` presente = veio da mediana; ausente = preço do catálogo. */
export interface Referencia { valor: number; vendas?: number }

export interface LinhaComValor {
  nome: string
  /** O valor que vai ser gravado para UMA peça. */
  valor: number
  referencia: Referencia | null | undefined
}

/** Mediana dos valores positivos; nula com menos de `MINIMO_DE_VENDAS`. */
export function medianaDasVendas(valores: number[]): MedianaVendas | null {
  const v = valores.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (v.length < MINIMO_DE_VENDAS) return null
  const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  return { valor: Math.round(m * 100) / 100, vendas: v.length }
}

/**
 * As medianas por produto a partir das vendas dos últimos 90 dias (as linhas já filtradas pela consulta:
 * empresa, período, não canceladas). Uma venda de N peças conta o valor de uma peça.
 */
export function medianasPorProduto(
  vendas: { produto_id: number | null; valor_venda: number | null; quantidade?: number | null }[],
): Record<number, MedianaVendas> {
  const por = new Map<number, number[]>()
  for (const v of vendas) {
    if (v.produto_id == null) continue
    const porPeca = (Number(v.valor_venda) || 0) / Math.max(1, Number(v.quantidade) || 1)
    const lista = por.get(v.produto_id) ?? []
    lista.push(porPeca)
    por.set(v.produto_id, lista)
  }
  const saida: Record<number, MedianaVendas> = {}
  for (const [id, valores] of por) {
    const m = medianaDasVendas(valores)
    if (m) saida[id] = m
  }
  return saida
}

/** O preço do catálogo, se houver; senão a mediana (já com o mínimo de vendas); senão nada. */
export function referenciaDoProduto(
  precoCatalogo: number | null | undefined,
  mediana: MedianaVendas | null | undefined,
): Referencia | null {
  const preco = Number(precoCatalogo) || 0
  if (preco > 0) return { valor: preco }
  if (mediana && mediana.valor > 0 && mediana.vendas >= MINIMO_DE_VENDAS) return { valor: mediana.valor, vendas: mediana.vendas }
  return null
}

/** As linhas cujo valor ficou abaixo da metade da referência. Valor zero tem aviso próprio. */
export function abaixoDoCatalogo<T extends LinhaComValor>(linhas: T[]): T[] {
  return linhas.filter((l) => {
    const ref = Number(l.referencia?.valor) || 0
    return ref > 0 && l.valor > 0 && l.valor < ref * FRACAO_MINIMA
  })
}

/** Reais sem os centavos quando são zero ("R$ 7.695"), como o dono fala da mediana. */
function reais(v: number): string {
  const t = formatCurrency(v)
  return Number.isInteger(v) ? t.replace(/,00$/, '') : t
}

/** O pedaço que diz o valor e de onde veio a referência (sem o "Confirme o valor: "). */
function corpo(l: LinhaComValor): string {
  const r = l.referencia
  if (!r) return formatCurrency(l.valor)
  if (r.vendas != null) return `${formatCurrency(l.valor)} — referência: mediana das últimas ${r.vendas} vendas: ${reais(r.valor)}`
  return `${formatCurrency(l.valor)} para um produto de ${formatCurrency(r.valor)} (preço do catálogo)`
}

/** "Confirme o valor: R$ 7,60 para um produto de R$ 7.695,00 (preço do catálogo)" — uma linha por item. */
export function textoConfirmeValor(l: LinhaComValor): string {
  return `Confirme o valor: ${corpo(l)}`
}

/** O texto do aviso para a lista toda (com o nome do item). */
export function descricaoConfirmeValor(linhas: LinhaComValor[]): string {
  if (linhas.length === 1) return `${textoConfirmeValor(linhas[0])}. Item: ${linhas[0].nome}. Se o valor estiver certo, siga.`
  return linhas.map((l) => `${l.nome}: ${corpo(l)}`).join(' · ') + '. Se os valores estiverem certos, siga.'
}
