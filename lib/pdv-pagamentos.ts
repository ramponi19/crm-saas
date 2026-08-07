/**
 * Formas de pagamento de uma venda — várias na mesma compra.
 *
 * O caixa real combina: metade no crédito em 3x, um pouco no Pix e o resto em
 * dinheiro. Uma forma só por venda obrigava o operador a escolher a "principal"
 * e mentir no resto, o que estragava a conciliação com a maquininha.
 *
 * O banco já aguentava: `vendas_pagamentos` sempre foi 1:N. Faltava a tela.
 */

export interface Taxa {
  id: number
  forma_pagamento: string
  bandeira: string | null
  parcelas: number | null
  percentual_taxa: number | null
}

export type Bandeira = 'visa_master' | 'outros'

export interface LinhaPagamento {
  /** Chave estável da linha na lista (não vai para o banco). */
  id: string
  forma: string
  /** Quanto esta forma abate do total devido. */
  valor: number
  bandeira?: Bandeira
  parcelas?: number
}

/** Formas que passam na maquininha e podem ter taxa/parcelamento. */
export const FORMAS_COM_TAXA = ['credito', 'link']
export const FORMAS_PARCELAVEIS = ['credito', 'link']

/** Taxa configurada para a linha, em %. */
export function taxaDaLinha(l: LinhaPagamento, taxas: Taxa[]): number {
  if (!FORMAS_COM_TAXA.includes(l.forma)) return 0
  const fpBanco = l.forma === 'credito' ? 'maquininha' : 'link'
  const taxa = taxas.find((t) =>
    t.forma_pagamento === fpBanco
    && t.parcelas === (l.parcelas ?? 1)
    && (fpBanco === 'link' || t.bandeira === (l.bandeira ?? 'visa_master')),
  )
  return Number(taxa?.percentual_taxa) || 0
}

/**
 * Valor efetivamente cobrado na linha. A taxa é repassada ao cliente — é como o
 * PDV sempre funcionou com forma única, e mudar isso aqui alteraria preço de
 * venda sem ninguém pedir.
 */
export function valorComJuros(l: LinhaPagamento, taxas: Taxa[]): number {
  const pct = taxaDaLinha(l, taxas)
  return pct > 0 ? l.valor * (1 + pct / 100) : l.valor
}

export interface ResumoPagamento {
  /** Soma do que as linhas abatem do total devido. */
  coberto: number
  /** Soma do que o cliente paga de fato (com juros de cartão). */
  cobrado: number
  /** Total devido menos o coberto. Positivo = falta; negativo = passou. */
  falta: number
  /** Juros somados de todas as linhas. */
  juros: number
  /** true quando as linhas fecham o total (tolerância de 1 centavo). */
  fechado: boolean
}

export function resumirPagamentos(linhas: LinhaPagamento[], total: number, taxas: Taxa[]): ResumoPagamento {
  const coberto = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const cobrado = linhas.reduce((s, l) => s + valorComJuros(l, taxas), 0)
  const falta = total - coberto
  return {
    coberto,
    cobrado,
    falta,
    juros: cobrado - coberto,
    // Centavo de tolerância: rateio e percentual produzem sobra de arredondamento,
    // e travar a venda por R$ 0,004 seria absurdo no balcão.
    fechado: Math.abs(falta) < 0.01,
  }
}

/**
 * Como registrar a venda quando há mais de uma forma. `vendas.forma_pagamento` é
 * uma coluna só; com várias, guarda 'multiplo' — o detalhe fica em
 * `vendas_pagamentos`, que é onde ele sempre esteve.
 */
export function formaResumida(linhas: LinhaPagamento[]): string {
  if (linhas.length === 0) return 'dinheiro'
  if (linhas.length === 1) return linhas[0].forma
  return 'multiplo'
}

/** Parcelas a gravar na venda: só faz sentido com uma forma parcelável. */
export function parcelasResumidas(linhas: LinhaPagamento[]): number | null {
  if (linhas.length !== 1) return null
  const l = linhas[0]
  return FORMAS_PARCELAVEIS.includes(l.forma) ? (l.parcelas ?? 1) : null
}

/** Opções de parcela configuradas para a forma/bandeira da linha. */
export function parcelasDisponiveis(l: LinhaPagamento, taxas: Taxa[]): number[] {
  if (!FORMAS_PARCELAVEIS.includes(l.forma)) return []
  const fpBanco = l.forma === 'credito' ? 'maquininha' : 'link'
  return taxas
    .filter((t) => t.forma_pagamento === fpBanco && (fpBanco === 'link' || t.bandeira === (l.bandeira ?? 'visa_master')))
    .map((t) => t.parcelas)
    .filter((p): p is number => !!p)
    .sort((a, b) => a - b)
}
