/**
 * Formatação de data que não perde um dia no caminho.
 *
 * O PROBLEMA, medido em produção (18/08/2026): um pedido de compra criado às
 * 17:41 de 18/08 aparecia na tela como **17/08**. A causa é a regra do JavaScript:
 * `new Date('2026-08-18')` — string só com data, sem hora — é interpretada como
 * meia-noite **UTC**. Renderizada no fuso de Brasília (UTC−3), volta para
 * 17/08 21:00. Toda coluna `date` do banco (`data_pedido`, `data_venc`,
 * `vencimento`, `data_nascimento`, `data_pagamento`, `devolucao_prevista`) cai
 * nessa armadilha.
 *
 * `timestamptz` NÃO tem esse problema: ali a hora vem no dado e a conversão é
 * correta. Por isso este helper distingue os dois casos em vez de somar fuso na
 * mão — somar horas quebraria justamente o caso que já funciona.
 */

/** `2026-08-18` (data pura, sem hora e sem fuso). */
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Converte o valor do banco em Date. Data pura é montada no fuso LOCAL, para o
 * dia 18 continuar sendo dia 18 em qualquer lugar do mundo.
 */
export function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor
  const bruto = valor.trim()
  if (SO_DATA.test(bruto)) {
    const [ano, mes, dia] = bruto.split('-').map(Number)
    return new Date(ano, mes - 1, dia)
  }
  const d = new Date(bruto)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Data pronta para a tela. Devolve `vazio` (por padrão em branco) quando não há
 * data — nunca "Invalid Date", que é o que aparece hoje quando o campo é nulo.
 */
export function formatarData(
  valor: string | Date | null | undefined,
  opcoes: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
  vazio = '',
): string {
  const d = paraData(valor)
  return d ? d.toLocaleDateString('pt-BR', opcoes) : vazio
}

/** Só dia e mês — o formato curto das listas. */
export function formatarDiaMes(valor: string | Date | null | undefined, vazio = ''): string {
  return formatarData(valor, { day: '2-digit', month: '2-digit' }, vazio)
}
