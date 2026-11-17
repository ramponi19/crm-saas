import { formatCurrency } from '@/lib/utils'

/**
 * VALOR MUITO ABAIXO DO PREÇO DO CATÁLOGO — aviso antes de salvar, sem bloquear (17/11/2026, pedido do Lucas).
 *
 * Uma encomenda real da JM entrou com R$ 7,60 num produto de mais de R$ 7 mil: um dígito fora do lugar que
 * ninguém viu. Desconto grande, brinde e preço combinado existem, então não é bloqueio: é uma pergunta com o
 * número na frente ("Confirme o valor: R$ 7,60 para um produto de R$ 7.695,00"). Vale no PDV, na encomenda
 * nova e no ajuste da encomenda em aberto. A referência é `estoque_produtos.preco` (o preço do catálogo);
 * produto sem preço no catálogo, ou item digitado sem produto cadastrado, não tem com o que comparar.
 */
export const FRACAO_MINIMA_DO_CATALOGO = 0.5

export interface LinhaComValor {
  nome: string
  /** O valor que vai ser gravado para UMA peça. */
  valor: number
  /** O preço do produto no catálogo; nulo ou zero = sem referência. */
  precoCatalogo: number | null | undefined
}

/** As linhas cujo valor ficou abaixo da metade do preço do catálogo. Valor zero tem aviso próprio. */
export function abaixoDoCatalogo<T extends LinhaComValor>(linhas: T[]): T[] {
  return linhas.filter((l) => {
    const ref = Number(l.precoCatalogo) || 0
    return ref > 0 && l.valor > 0 && l.valor < ref * FRACAO_MINIMA_DO_CATALOGO
  })
}

/** "Confirme o valor: R$ 7,60 para um produto de R$ 7.695,00" — uma linha por item. */
export function textoConfirmeValor(l: LinhaComValor): string {
  return `Confirme o valor: ${formatCurrency(l.valor)} para um produto de ${formatCurrency(Number(l.precoCatalogo) || 0)}`
}

/** O texto do aviso para a lista toda (com o nome do item quando há mais de um). */
export function descricaoConfirmeValor(linhas: LinhaComValor[]): string {
  if (linhas.length === 1) return `${textoConfirmeValor(linhas[0])} (${linhas[0].nome}). Se o valor estiver certo, siga.`
  return linhas.map((l) => `${l.nome}: ${textoConfirmeValor(l).replace(/^Confirme o valor: /, '')}`).join(' · ')
    + '. Se os valores estiverem certos, siga.'
}
