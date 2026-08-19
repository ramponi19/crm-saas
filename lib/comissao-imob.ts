/**
 * Como a comissão de um negócio imobiliário é calculada.
 *
 * Módulo NEUTRO — sem React, sem `'use client'`, para poder ser usado por rota de
 * servidor e por tela. (Ver `lib/planos.ts`: importar matriz de regra de negócio de
 * arquivo de UI estourou 500 em produção em 18/08.)
 *
 * ⚠ DUAS DEFINIÇÕES AINDA NÃO CONFIRMADAS PELO DONO (19/08/2026)
 *
 * O sistema que ele usa hoje mostra uma tabela com "Valor Negócio · % · Comissão ·
 * Cashback" e nenhuma legenda. Deduzi o seguinte, e deixei configurável para que
 * corrigir seja questão de trocar um número na tela, não de mexer em código:
 *
 * 1. A COMISSÃO É % SOBRE O VALOR DO NEGÓCIO. Na venda, um percentual do preço
 *    fechado; na locação, um percentual do valor do aluguel (100 = um mês, que é a
 *    praxe da maioria das imobiliárias).
 * 2. O CASHBACK É VALOR DEVOLVIDO AO CLIENTE e sai da parte da CASA — não da parte
 *    dos corretores. Se na verdade for bônus do corretor, o sinal se inverte e este
 *    arquivo muda junto com o comentário da migração.
 *
 * Enquanto não houver confirmação, a tela mostra os números como PREVISTOS e diz de
 * onde saíram. Número que parece definitivo sem ser é o pior dos dois mundos.
 */

export interface TaxasComissao {
  /** % sobre o preço fechado, na venda. */
  percentual_venda: number
  /** % sobre o valor do aluguel, na locação. 100 = um mês inteiro. */
  percentual_locacao: number
  /** Quanto da comissão total vai para quem CAPTOU o imóvel (%). */
  parte_captador: number
  /** Quanto da comissão total vai para quem VENDEU (%). */
  parte_vendedor: number
}

/**
 * Padrões de mercado, não invenção: 6% na venda e um mês de aluguel na locação são
 * a praxe no Brasil; 25/25 entre captador e vendedor deixa metade para a casa, que
 * é o arranjo mais comum quando a imobiliária banca a estrutura.
 *
 * São PONTO DE PARTIDA. Cada imobiliária ajusta na tela, e o valor ajustado é o que
 * vale para os negócios seguintes.
 */
export const TAXAS_PADRAO: TaxasComissao = {
  percentual_venda: 6,
  percentual_locacao: 100,
  parte_captador: 25,
  parte_vendedor: 25,
}

/** Junta o que a loja configurou com o padrão, campo por campo. */
export function mesclarTaxas(cfg: Partial<TaxasComissao> | null | undefined): TaxasComissao {
  const n = (v: unknown, padrao: number) => {
    const x = Number(v)
    return Number.isFinite(x) && x >= 0 ? x : padrao
  }
  return {
    percentual_venda:   n(cfg?.percentual_venda,   TAXAS_PADRAO.percentual_venda),
    percentual_locacao: n(cfg?.percentual_locacao, TAXAS_PADRAO.percentual_locacao),
    parte_captador:     n(cfg?.parte_captador,     TAXAS_PADRAO.parte_captador),
    parte_vendedor:     n(cfg?.parte_vendedor,     TAXAS_PADRAO.parte_vendedor),
  }
}

export interface ComissaoCalculada {
  percentual: number
  total: number
  captador: number
  vendedor: number
  /** O que sobra para a imobiliária, já descontado o cashback. */
  casa: number
}

const arredonda = (v: number) => Math.round(v * 100) / 100

/**
 * Calcula a comissão de um negócio.
 *
 * `cashback` sai da parte da casa e NUNCA a deixa negativa: devolver ao cliente mais
 * do que a casa ganhou seria prejuízo silencioso no relatório. Quando o valor
 * informado passa da parte da casa, o excedente é ignorado no cálculo e quem chamou
 * recebe `casa: 0` — a tela avisa em vez de o número mentir.
 */
export function calcularComissao(
  tipo: 'venda' | 'locacao',
  valor: number,
  taxas: TaxasComissao,
  cashback = 0,
): ComissaoCalculada {
  const percentual = tipo === 'locacao' ? taxas.percentual_locacao : taxas.percentual_venda
  const total = arredonda((Number(valor) || 0) * (percentual / 100))
  const captador = arredonda(total * (taxas.parte_captador / 100))
  const vendedor = arredonda(total * (taxas.parte_vendedor / 100))
  const casaBruta = arredonda(total - captador - vendedor)
  const casa = arredonda(Math.max(0, casaBruta - Math.max(0, Number(cashback) || 0)))
  return { percentual, total, captador, vendedor, casa }
}

/** O cashback informado cabe na parte da casa? Serve para a tela avisar antes. */
export function cashbackCabe(c: ComissaoCalculada, cashback: number): boolean {
  const casaBruta = c.total - c.captador - c.vendedor
  return (Number(cashback) || 0) <= casaBruta + 0.005
}
