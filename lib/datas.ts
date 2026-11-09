/**
 * DATAS NO FUSO DA EMPRESA — a única biblioteca de datas do app (10/11/2026).
 *
 * O servidor roda em UTC (Vercel); o navegador, no fuso de quem usa; a loja, no
 * fuso dela. Toda conta que dependa de "que dia é" ou "que horas são" — hoje, este
 * mês, início do dia, a hora de uma visita, o dia de um vencimento — passa por aqui,
 * com o fuso da empresa explícito. Sem isso, das 21h à meia-noite de Brasília o
 * servidor já está "amanhã": o KPI Hoje zerava às 21h, a hora da visita saía +3h e
 * o mês virava no dia 30 às 21h (06, seção 37). `scripts/check-datas.mjs` reprova o
 * uso direto de getDate/setHours/toLocale… fora daqui.
 *
 * DOIS TIPOS DE VALOR NO BANCO:
 *  - `timestamptz` (created_at, data_hora…): um INSTANTE. Mostra-se no fuso da loja.
 *  - `date` (data_venc, data_nascimento…): um DIA, sem hora e sem fuso. `new
 *    Date('2026-08-18')` o lê como meia-noite UTC = 17/08 21h em Brasília; por isso
 *    data pura nunca vira Date aqui sem passar por `paraData`/`formatarData`.
 *
 * Funções puras: o fuso entra por parâmetro (padrão `FUSO_PADRAO`). No servidor ele
 * vem de `fusoDaEmpresa` (lib/fuso-empresa.ts); no navegador, de `useFuso()`
 * (components/fuso-provider.tsx).
 */

/** O fuso de quem não configurou nada: todas as lojas de hoje estão nele. */
export const FUSO_PADRAO = 'America/Sao_Paulo'
/** Nome antigo (lote 2 da auditoria); o mesmo valor. */
export const FUSO = FUSO_PADRAO

/** `2026-08-18` (data pura, sem hora e sem fuso). */
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/
const DIA_MS = 86_400_000

type Valor = string | Date | null | undefined

/** O fuso é um nome IANA que o `Intl` desta máquina conhece? */
export function fusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== 'string' || !fuso.trim()) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: fuso }); return true } catch { return false }
}

/** O fuso pedido, ou o padrão quando vazio ou desconhecido. */
export function fusoOuPadrao(fuso?: string | null): string {
  return fusoValido(fuso) ? fuso : FUSO_PADRAO
}

/** O único `new Date()` "solto" do app: o instante de agora. */
export function agora(): Date {
  return new Date()
}

// ── Partes de um instante num fuso ──────────────────────────────────────────

export interface Partes {
  ano: number
  /** 1–12 */
  mes: number
  dia: number
  hora: number
  minuto: number
  segundo: number
  /** 0 = domingo … 6 = sábado */
  diaSemana: number
}

const SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const formatadores = new Map<string, Intl.DateTimeFormat>()
function formatadorDePartes(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatadores.set(fuso, f)
  }
  return f
}

/** Ano, mês, dia, hora… do instante `d` no relógio de parede do fuso. */
export function partesNoFuso(d: Date, fuso: string = FUSO_PADRAO): Partes {
  const p: Record<string, string> = {}
  for (const x of formatadorDePartes(fusoOuPadrao(fuso)).formatToParts(d)) p[x.type] = x.value
  return {
    ano: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour) % 24, minuto: Number(p.minute), segundo: Number(p.second),
    diaSemana: SEMANA[p.weekday] ?? 0,
  }
}

const dois = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` do instante no fuso — o "que dia é" da loja. Serve para coluna `date`. */
export function diaNoFuso(d: Date = agora(), fuso: string = FUSO_PADRAO): string {
  const p = partesNoFuso(d, fuso)
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`
}

/** `YYYY-MM` do instante no fuso — a chave de mês de agrupamentos e metas. */
export function mesNoFuso(d: Date = agora(), fuso: string = FUSO_PADRAO): string {
  return diaNoFuso(d, fuso).slice(0, 7)
}

/** Dois instantes caem no mesmo dia da loja? */
export function mesmoDia(a: Date, b: Date, fuso: string = FUSO_PADRAO): boolean {
  return diaNoFuso(a, fuso) === diaNoFuso(b, fuso)
}

// ── Aritmética de dias (calendário puro, sem fuso) ──────────────────────────

function ymd(dia: string): [number, number, number] {
  const [a, m, d] = dia.slice(0, 10).split('-').map(Number)
  return [a, m, d]
}
function deUtc(t: number): string {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`
}

/** `2026-11-30` + 1 = `2026-12-01`. */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = ymd(dia)
  return deUtc(Date.UTC(a, m - 1, d) + n * DIA_MS)
}

/** Primeiro dia do mês de `dia`, deslocado `n` meses: (`2026-11-15`, -1) → `2026-10-01`. */
export function primeiroDoMes(dia: string, n = 0): string {
  const [a, m] = ymd(dia)
  return deUtc(Date.UTC(a, m - 1 + n, 1))
}

/** Dias corridos de `de` até `ate` (datas puras). */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = ymd(de); const [a2, m2, d2] = ymd(ate)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / DIA_MS)
}

/** Dia da semana (0 = domingo) de uma data pura. */
export function diaDaSemana(dia: string): number {
  const [a, m, d] = ymd(dia)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

// ── Do relógio de parede para o instante ────────────────────────────────────

/** Quantos ms o relógio do fuso está à frente do UTC no instante `t`. */
function deslocamento(t: number, fuso: string): number {
  const p = partesNoFuso(new Date(t), fuso)
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(t / 1000) * 1000
}

/**
 * O instante em que o relógio do fuso marca `dia` às `hhmm`.
 * `instanteLocal('2026-11-10', '09:00')` = 2026-11-10T12:00:00Z (Brasília, UTC−3).
 * Converge em duas voltas mesmo na troca de horário de verão de outros fusos.
 */
export function instanteLocal(dia: string, hhmm = '00:00', fuso: string = FUSO_PADRAO): Date {
  const f = fusoOuPadrao(fuso)
  const [a, m, d] = ymd(dia)
  const [h, mi] = hhmm.split(':').map((x) => Number(x) || 0)
  const parede = Date.UTC(a, m - 1, d, h, mi)
  let t = parede - deslocamento(parede, f)
  t = parede - deslocamento(t, f)
  return new Date(t)
}

// ── Limites de período (sempre [início, fim) — fim exclusivo) ───────────────

/** 00:00 de hoje (ou do dia de `d`) no fuso. */
export function inicioDoDia(d: Date = agora(), fuso: string = FUSO_PADRAO): Date {
  return instanteLocal(diaNoFuso(d, fuso), '00:00', fuso)
}

/** 00:00 do dia seguinte: o fim EXCLUSIVO do dia (`< fimDoDia`). */
export function fimDoDia(d: Date = agora(), fuso: string = FUSO_PADRAO): Date {
  return instanteLocal(somarDias(diaNoFuso(d, fuso), 1), '00:00', fuso)
}

/** 00:00 do dia `n` dias antes de hoje (n = 6 → janela de 7 dias contando hoje). */
export function inicioDoDiaHaDias(n: number, d: Date = agora(), fuso: string = FUSO_PADRAO): Date {
  return instanteLocal(somarDias(diaNoFuso(d, fuso), -n), '00:00', fuso)
}

/** 00:00 do primeiro dia da semana (padrão segunda-feira) no fuso. */
export function inicioDaSemana(d: Date = agora(), fuso: string = FUSO_PADRAO, primeiroDia = 1): Date {
  const hoje = diaNoFuso(d, fuso)
  const volta = (diaDaSemana(hoje) - primeiroDia + 7) % 7
  return instanteLocal(somarDias(hoje, -volta), '00:00', fuso)
}

/** 00:00 do dia 1 do mês (deslocado `n` meses) no fuso. */
export function inicioDoMes(d: Date = agora(), fuso: string = FUSO_PADRAO, n = 0): Date {
  return instanteLocal(primeiroDoMes(diaNoFuso(d, fuso), n), '00:00', fuso)
}

/** 00:00 do dia 1 do mês seguinte: o fim EXCLUSIVO do mês. */
export function fimDoMes(d: Date = agora(), fuso: string = FUSO_PADRAO): Date {
  return inicioDoMes(d, fuso, 1)
}

/** 00:00 de 1º de janeiro (deslocado `n` anos) no fuso. */
export function inicioDoAno(d: Date = agora(), fuso: string = FUSO_PADRAO, n = 0): Date {
  const ano = partesNoFuso(d, fuso).ano + n
  return instanteLocal(`${ano}-01-01`, '00:00', fuso)
}

/** 00:00 de 1º de janeiro do ano seguinte. */
export function fimDoAno(d: Date = agora(), fuso: string = FUSO_PADRAO): Date {
  return inicioDoAno(d, fuso, 1)
}

/** Início e fim (exclusivo) de um MÊS `YYYY-MM` no fuso. */
export function limitesDoMes(mes: string, fuso: string = FUSO_PADRAO): { de: Date; ate: Date } {
  const primeiro = `${mes.slice(0, 7)}-01`
  return { de: instanteLocal(primeiro, '00:00', fuso), ate: instanteLocal(primeiroDoMes(primeiro, 1), '00:00', fuso) }
}

/** Início e fim (exclusivo) de um intervalo de DIAS `de`…`ate` (inclusivo para quem lê). */
export function limitesDosDias(de: string, ate: string, fuso: string = FUSO_PADRAO): { de: Date; ate: Date } {
  return { de: instanteLocal(de, '00:00', fuso), ate: instanteLocal(somarDias(ate, 1), '00:00', fuso) }
}

export type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | 'semana' | 'mes' | 'mes_anterior' | 'ano'

/**
 * Os períodos dos painéis, no fuso. "7d" e "30d" contam o dia de hoje: 7d = hoje e
 * os 6 dias anteriores, inteiros.
 */
export function periodo(p: Periodo, d: Date = agora(), fuso: string = FUSO_PADRAO): { de: Date; ate: Date } {
  switch (p) {
    case 'hoje': return { de: inicioDoDia(d, fuso), ate: fimDoDia(d, fuso) }
    case 'ontem': return { de: inicioDoDiaHaDias(1, d, fuso), ate: inicioDoDia(d, fuso) }
    case '7d': return { de: inicioDoDiaHaDias(6, d, fuso), ate: fimDoDia(d, fuso) }
    case '30d': return { de: inicioDoDiaHaDias(29, d, fuso), ate: fimDoDia(d, fuso) }
    case 'semana': return { de: inicioDaSemana(d, fuso), ate: fimDoDia(d, fuso) }
    case 'mes': return { de: inicioDoMes(d, fuso), ate: fimDoMes(d, fuso) }
    case 'mes_anterior': return { de: inicioDoMes(d, fuso, -1), ate: inicioDoMes(d, fuso) }
    case 'ano': return { de: inicioDoAno(d, fuso), ate: fimDoAno(d, fuso) }
  }
}

// ── Leitura do banco ────────────────────────────────────────────────────────

/**
 * Converte o valor do banco em Date. Data pura vira o MEIO-DIA UTC daquele dia:
 * cai no mesmo dia em qualquer fuso de −11h a +11h, então `diaNoFuso` e
 * `formatarData` devolvem o dia certo sem saber que era data pura.
 */
export function paraData(valor: Valor): Date | null {
  if (!valor) return null
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor
  const bruto = valor.trim()
  if (SO_DATA.test(bruto)) {
    const [a, m, d] = ymd(bruto)
    return new Date(Date.UTC(a, m - 1, d, 12))
  }
  const d = new Date(bruto)
  return isNaN(d.getTime()) ? null : d
}

/** É data pura (`YYYY-MM-DD`)? Data pura se mostra sem fuso. */
export function ehDataPura(valor: Valor): valor is string {
  return typeof valor === 'string' && SO_DATA.test(valor.trim())
}

/** Para gravar um instante: ISO em UTC. */
export function paraBanco(d: Date): string {
  return d.toISOString()
}

/**
 * Instantes do banco iguais? O PostgREST devolve `2026-11-10T13:00:00+00:00` e o
 * `toISOString` dá `2026-11-10T13:00:00.000Z`: o texto difere, o instante não.
 */
export function mesmoInstante(a: Valor, b: Valor): boolean {
  const x = paraData(a); const y = paraData(b)
  return !!x && !!y && x.getTime() === y.getTime()
}

/** Chave estável de um instante para Set/Map (ms desde 1970), qualquer que seja o formato do texto. */
export function chaveDoInstante(valor: Valor): number | null {
  return paraData(valor)?.getTime() ?? null
}

// ── Formatação (pt-BR) ──────────────────────────────────────────────────────

const DATA_PADRAO: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }

/**
 * Data pronta para a tela. Devolve `vazio` (por padrão em branco) quando não há
 * data — nunca "Invalid Date".
 *
 * Timestamp: no fuso da loja — o mesmo texto no servidor (UTC) e no navegador, sem
 * o erro de hidratação #418. Data pura: o dia dela, sem fuso.
 */
export function formatarData(valor: Valor, opcoes: Intl.DateTimeFormatOptions = DATA_PADRAO, vazio = '', fuso: string = FUSO_PADRAO): string {
  const d = paraData(valor)
  if (!d) return vazio
  const tz = ehDataPura(valor) ? 'UTC' : fusoOuPadrao(fuso)
  return d.toLocaleDateString('pt-BR', { ...opcoes, timeZone: tz })
}

/** Só dia e mês — o formato curto das listas. */
export function formatarDiaMes(valor: Valor, vazio = '', fuso: string = FUSO_PADRAO): string {
  return formatarData(valor, { day: '2-digit', month: '2-digit' }, vazio, fuso)
}

/** `14:30` no fuso da loja. Data pura não tem hora: devolve `vazio`. */
export function formatarHora(valor: Valor, vazio = '', fuso: string = FUSO_PADRAO): string {
  const d = paraData(valor)
  if (!d || ehDataPura(valor)) return vazio
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fusoOuPadrao(fuso) })
}

/** `10/11/2026 14:30` (ou o formato pedido) no fuso da loja. */
export function formatarDataHora(
  valor: Valor,
  opcoes: Intl.DateTimeFormatOptions = { ...DATA_PADRAO, hour: '2-digit', minute: '2-digit' },
  vazio = '',
  fuso: string = FUSO_PADRAO,
): string {
  const d = paraData(valor)
  if (!d) return vazio
  const tz = ehDataPura(valor) ? 'UTC' : fusoOuPadrao(fuso)
  return d.toLocaleString('pt-BR', { ...opcoes, timeZone: tz })
}

/** Qualquer formato do `Intl` no fuso da loja (ex.: `{ month: 'long' }` → "novembro"). */
export function formatarNoFuso(valor: Valor, opcoes: Intl.DateTimeFormatOptions, vazio = '', fuso: string = FUSO_PADRAO): string {
  const d = paraData(valor)
  if (!d) return vazio
  const tz = ehDataPura(valor) ? 'UTC' : fusoOuPadrao(fuso)
  return d.toLocaleString('pt-BR', { ...opcoes, timeZone: tz })
}

/** "novembro de 2026" de um mês `YYYY-MM` (sem fuso: é um rótulo de calendário). */
export function rotuloDoMes(mes: string, opcoes: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }): string {
  return new Date(`${mes.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('pt-BR', { ...opcoes, timeZone: 'UTC' })
}

/**
 * Os fusos do Brasil, para a escolha em Configurações (o padrão primeiro). Um por
 * deslocamento: sem horário de verão desde 2019, os UTC−3 do Norte e do Nordeste
 * andam junto com Brasília.
 */
export const FUSOS_DO_BRASIL: { fuso: string; rotulo: string }[] = [
  { fuso: 'America/Sao_Paulo', rotulo: 'Brasília (UTC−3)' },
  { fuso: 'America/Manaus', rotulo: 'Amazonas, MT, MS, RO e RR (UTC−4)' },
  { fuso: 'America/Rio_Branco', rotulo: 'Acre (UTC−5)' },
  { fuso: 'America/Noronha', rotulo: 'Fernando de Noronha (UTC−2)' },
]
