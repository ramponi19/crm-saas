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
 * O fuso das lojas. O produto so atende o Brasil e as lojas estao todas no
 * horario de Brasilia; um fuso por empresa ainda nao existe (mesma decisao de
 * lib/zapintel/montar.ts).
 */
export const FUSO = 'America/Sao_Paulo'

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
  /**
   * O fuso entra SEMPRE, para o texto sair igual no servidor (UTC na Vercel) e no
   * navegador (Brasilia). Sem ele, um timestamp depois das 21h saia com o dia
   * seguinte no servidor e o certo no navegador — dia errado na pagina e o erro
   * de hidratacao #418 na troca.
   *
   * Data pura e montada em UTC e formatada em UTC: o dia 18 continua 18 nos dois
   * lados. Timestamp e formatado no fuso da loja.
   */
  if (typeof valor === 'string' && SO_DATA.test(valor.trim())) {
    const [ano, mes, dia] = valor.trim().split('-').map(Number)
    return new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString('pt-BR', { ...opcoes, timeZone: 'UTC' })
  }
  const d = paraData(valor)
  return d ? d.toLocaleDateString('pt-BR', { timeZone: FUSO, ...opcoes }) : vazio
}

/** Só dia e mês — o formato curto das listas. */
export function formatarDiaMes(valor: string | Date | null | undefined, vazio = ''): string {
  return formatarData(valor, { day: '2-digit', month: '2-digit' }, vazio)
}

/** Hora e minuto no fuso da loja (`14:05`) — igual no servidor e no navegador. */
export function formatarHora(valor: string | Date | null | undefined, vazio = ''): string {
  const d = paraData(valor)
  return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }) : vazio
}

/** Data e hora no fuso da loja (`16/10/2026, 14:05`). */
export function formatarDataHora(
  valor: string | Date | null | undefined,
  opcoes: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  vazio = '',
): string {
  const d = paraData(valor)
  return d ? d.toLocaleString('pt-BR', { timeZone: FUSO, ...opcoes }) : vazio
}

/**
 * O DIA E O MÊS DA LOJA, não do processo.
 *
 * O servidor da Vercel roda em UTC: lá, `getDate()`, `setHours(0, 0, 0, 0)` e
 * `new Date(ano, mes, 1)` valem para Greenwich. Entre 21h e meia-noite de
 * Brasília o servidor já está no dia seguinte, e o "início do mês" vira 21h do
 * último dia do mês anterior — a venda das 22h do dia 31 entrava no mês errado.
 * As funções abaixo calculam no fuso da loja em qualquer processo.
 *
 * Brasília está em UTC−3 fixo desde 2019 (sem horário de verão); é o
 * deslocamento fixo que permite montar a meia-noite sem tabela de fuso.
 */
const DESLOCAMENTO_HORAS = 3

const PARTES = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Ano, mês (1–12) e dia do calendário de Brasília em que o instante cai. */
export function partesSP(d: Date = new Date()): { ano: number; mes: number; dia: number } {
  const p: Record<string, string> = {}
  for (const x of PARTES.formatToParts(d)) p[x.type] = x.value
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day) }
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** `2026-10-16` — o dia de Brasília. Serve de chave e de valor de `<input type="date">`. */
export function diaSP(d: Date = new Date()): string {
  const { ano, mes, dia } = partesSP(d)
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`
}

/** `2026-10` — o mês de Brasília. Mesmo formato de `metas_comissoes.mes_ano`. */
export function mesSP(d: Date = new Date()): string {
  const { ano, mes } = partesSP(d)
  return `${ano}-${doisDigitos(mes)}`
}

/**
 * O instante da meia-noite de Brasília de um dia (`YYYY-MM-DD` ou o dia em que
 * o instante cai), somando `dias` — negativo volta. Limite de período para
 * consulta: `gte(meiaNoiteSP())` é "de hoje"; `lt(meiaNoiteSP(hoje, 1))`, "até hoje".
 */
export function meiaNoiteSP(dia: string | Date = new Date(), dias = 0): Date {
  const { ano, mes, dia: d } = typeof dia === 'string'
    ? (() => { const [a, m, x] = dia.split('-').map(Number); return { ano: a, mes: m, dia: x } })()
    : partesSP(dia)
  return new Date(Date.UTC(ano, mes - 1, d + dias, DESLOCAMENTO_HORAS))
}

/** Meia-noite do dia 1º do mês de Brasília, somando `meses` — negativo volta. */
export function inicioMesSP(d: Date = new Date(), meses = 0): Date {
  const { ano, mes } = partesSP(d)
  return new Date(Date.UTC(ano, mes - 1 + meses, 1, DESLOCAMENTO_HORAS))
}

/** Meia-noite de 1º de janeiro do ano de Brasília. */
export function inicioAnoSP(d: Date = new Date()): Date {
  return new Date(Date.UTC(partesSP(d).ano, 0, 1, DESLOCAMENTO_HORAS))
}
