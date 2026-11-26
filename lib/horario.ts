/**
 * HORÁRIO DE FUNCIONAMENTO POR DIA E POR LOJA (24/11/2026). Universal: vale para qualquer empresa.
 *
 * Fonte: `configuracoes_sistema`, chave `core.horario` (config provisória da M2/D6), valor
 * `{ empresa: Horario, lojas: { "<filial_id>": Horario } }`. A loja que tem valor próprio substitui a semana
 * inteira; sem valor próprio, vale o da empresa.
 *
 *   Horario = { semana: { "0".."6": [{ abre: "HH:MM", fecha: "HH:MM" }, ...] }, sla_resposta_min?: number }
 *   (0 = domingo … 6 = sábado; lista vazia = fechado; mais de um intervalo = pausa, ex. almoço)
 *
 * Compatibilidade (fase 1 de 3): sem `core.horario`, vale o formato antigo `horario_comercial`
 * ({ inicio, fim, dias, sla_resposta_min }) convertido; sem nenhum dos dois, o padrão de sempre (seg–sex, 9h–18h).
 * A tela grava as duas chaves (a antiga derivada da nova, `paraFormatoAntigo`) até todos os leitores migrarem.
 *
 * "Dia útil" = dia em que a loja abre. As mesmas regras existem no banco (core_horario, core_abre_no_dia,
 * core_horas_do_dia, core_proximo_dia_aberto — migração 20261124001200).
 */
import { diaDaSemana, instanteLocal, partesNoFuso, somarDias, FUSO_PADRAO } from '@/lib/datas'

export const CHAVE_HORARIO = 'core.horario'
export const CHAVE_HORARIO_ANTIGA = 'horario_comercial'

export interface Intervalo { abre: string; fecha: string }
export type Semana = Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', Intervalo[]>
export interface Horario { semana: Semana; sla_resposta_min?: number | null }
/** O valor gravado em `core.horario`. */
export interface HorarioConfig { empresa?: Horario | null; lojas?: Record<string, Horario | null> | null }

const DIAS = ['0', '1', '2', '3', '4', '5', '6'] as const
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const minutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

/** Seg–sex, 9h–18h: o padrão do app desde sempre (lib/automatize/travas, agenda, alertas). */
export const HORARIO_PADRAO: Horario = semanaCom([1, 2, 3, 4, 5], { abre: '09:00', fecha: '18:00' })

function semanaCom(dias: number[], i: Intervalo): Horario {
  return { semana: Object.fromEntries(DIAS.map((d) => [d, dias.includes(Number(d)) ? [{ ...i }] : []])) as Semana }
}

/** Intervalos válidos, em ordem e sem sobreposição; `null` se o dia tiver algo inválido. */
function intervalosValidos(v: unknown): Intervalo[] | null {
  if (!Array.isArray(v)) return null
  const out: Intervalo[] = []
  for (const x of v as Partial<Intervalo>[]) {
    if (!x || typeof x.abre !== 'string' || typeof x.fecha !== 'string' || !HHMM.test(x.abre) || !HHMM.test(x.fecha)) return null
    if (minutos(x.fecha) <= minutos(x.abre)) return null
    out.push({ abre: x.abre, fecha: x.fecha })
  }
  out.sort((a, b) => minutos(a.abre) - minutos(b.abre))
  for (let i = 1; i < out.length; i++) if (minutos(out[i].abre) < minutos(out[i - 1].fecha)) return null
  return out
}

/** Valida um horário no formato novo; `null` se não for um. Precisa abrir pelo menos um dia. */
export function horarioValido(v: unknown): Horario | null {
  const s = (v as { semana?: Record<string, unknown> } | null)?.semana
  if (!s || typeof s !== 'object') return null
  const semana = {} as Semana
  for (const d of DIAS) {
    const iv = intervalosValidos(s[d] ?? [])
    if (!iv) return null
    semana[d] = iv
  }
  if (!DIAS.some((d) => semana[d].length)) return null
  const sla = (v as { sla_resposta_min?: unknown }).sla_resposta_min
  return { semana, sla_resposta_min: typeof sla === 'number' && sla >= 0 ? sla : null }
}

/** O formato antigo (`horario_comercial`) convertido; `null` se não houver um válido. */
export function doFormatoAntigo(v: unknown): Horario | null {
  const x = (v ?? {}) as { inicio?: unknown; fim?: unknown; dias?: unknown; sla_resposta_min?: unknown }
  if (typeof x.inicio !== 'string' || typeof x.fim !== 'string' || !HHMM.test(x.inicio) || !HHMM.test(x.fim)) return null
  if (minutos(x.fim) <= minutos(x.inicio) || !Array.isArray(x.dias) || !x.dias.length) return null
  const h = semanaCom(x.dias.map(Number), { abre: x.inicio, fecha: x.fim })
  return { ...h, sla_resposta_min: typeof x.sla_resposta_min === 'number' ? x.sla_resposta_min : null }
}

/**
 * O horário que vale para a loja: o próprio da loja → o da empresa (core.horario) → o antigo (horario_comercial)
 * → o padrão. Nunca devolve vazio.
 */
export function horarioDaLoja(novo: unknown, antigo: unknown, filialId?: number | null): Horario {
  const cfg = (novo ?? {}) as HorarioConfig
  const daLoja = filialId != null ? horarioValido(cfg.lojas?.[String(filialId)]) : null
  return daLoja ?? horarioValido(cfg.empresa) ?? doFormatoAntigo(antigo) ?? HORARIO_PADRAO
}

/** A loja tem horário próprio gravado? (para a tela mostrar "usa o padrão da empresa") */
export function temHorarioProprio(novo: unknown, filialId: number): boolean {
  return horarioValido(((novo ?? {}) as HorarioConfig).lojas?.[String(filialId)]) != null
}

const intervalosDoDia = (h: Horario, dia: string) => h.semana[String(diaDaSemana(dia)) as keyof Semana] ?? []

/** A loja abre neste dia (AAAA-MM-DD)? É a definição de "dia útil". */
export function abreNoDia(h: Horario, dia: string): boolean { return intervalosDoDia(h, dia).length > 0 }

/** Horas abertas no dia (soma dos intervalos). */
export function horasDoDia(h: Horario, dia: string): number {
  return intervalosDoDia(h, dia).reduce((t, i) => t + (minutos(i.fecha) - minutos(i.abre)) / 60, 0)
}

/** Horas do dia mais longo da semana: a referência do teto proporcional. */
export function horasReferencia(h: Horario): number {
  return Math.max(0, ...DIAS.map((d) => h.semana[d].reduce((t, i) => t + (minutos(i.fecha) - minutos(i.abre)) / 60, 0)))
}

/** Próximo dia em que a loja abre, DEPOIS de `dia`. */
export function proximoDiaAberto(h: Horario, dia: string): string {
  let d = somarDias(dia, 1)
  for (let i = 0; i < 7 && !abreNoDia(h, d); i++) d = somarDias(d, 1)
  return d
}

/** O próprio dia, se a loja abre nele; senão o próximo dia aberto. */
export function noDiaAberto(h: Horario, dia: string): string { return abreNoDia(h, dia) ? dia : proximoDiaAberto(h, dia) }

/**
 * Teto proporcional às horas do dia: teto × horas do dia ÷ horas do dia mais longo da semana, no mínimo 1
 * quando a loja abre; 0 quando está fechada. Ex.: 25 com sábado de 4h numa semana de 9h → 11.
 */
export function tetoDoDia(teto: number, h: Horario, dia: string): number {
  const horas = horasDoDia(h, dia)
  if (!horas) return 0
  const ref = horasReferencia(h)
  return Math.max(1, Math.floor((teto * horas) / (ref || horas)))
}

function noFuso(instante: Date, fuso: string) {
  const p = partesNoFuso(instante, fuso)
  const hoje = `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
  return { hoje, min: p.hora * 60 + p.minuto }
}

/** Está aberto agora? */
export function abertoAgora(instante: Date, h: Horario, fuso: string = FUSO_PADRAO): boolean {
  const { hoje, min } = noFuso(instante, fuso)
  return intervalosDoDia(h, hoje).some((i) => min >= minutos(i.abre) && min < minutos(i.fecha))
}

/** O instante em que dá para agir: agora, se aberto; senão a próxima abertura (até 8 dias à frente). */
export function proximaAbertura(instante: Date, h: Horario, fuso: string = FUSO_PADRAO): Date {
  if (abertoAgora(instante, h, fuso)) return instante
  const { hoje, min } = noFuso(instante, fuso)
  for (let d = 0; d <= 8; d++) {
    const dia = somarDias(hoje, d)
    for (const i of intervalosDoDia(h, dia)) {
      if (d === 0 && minutos(i.abre) <= min) continue
      return instanteLocal(dia, i.abre, fuso)
    }
  }
  return instante
}

/**
 * O formato antigo derivado do novo, para os leitores que ainda não migraram (fase 1): dias = os dias em que
 * abre; início e fim = o primeiro e o último horário do dia útil mais comum. Um sábado reduzido aparece como dia
 * aberto com o horário da semana — por isso os leitores migram na fase 2.
 */
export function paraFormatoAntigo(h: Horario): { inicio: string; fim: string; dias: number[]; sla_resposta_min?: number } {
  const dias = DIAS.filter((d) => h.semana[d].length).map(Number)
  const conta = new Map<string, number>()
  for (const d of dias) {
    const iv = h.semana[String(d) as keyof Semana]
    const k = `${iv[0].abre}-${iv[iv.length - 1].fecha}`
    conta.set(k, (conta.get(k) ?? 0) + 1)
  }
  const [inicio, fim] = ([...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '09:00-18:00').split('-')
  return { inicio, fim, dias, ...(h.sla_resposta_min != null ? { sla_resposta_min: h.sla_resposta_min } : {}) }
}

/**
 * Minutos de EXPEDIENTE entre dois instantes pelo horário por dia (com pausas e sábado reduzido), no fuso da loja.
 * 1.1h parte 2 (26/11/2026): substitui `minutosUteis` do formato antigo (lib/horario-util) na devolução da esteira —
 * o formato antigo via o sábado reduzido como dia inteiro. Loja fechada todo dia: devolve o tempo corrido (senão o
 * prazo nunca venceria). Varre dia a dia, no máximo 400 dias.
 */
export function minutosDeExpediente(de: Date, ate: Date, h: Horario, fuso: string = FUSO_PADRAO): number {
  if (!(de instanceof Date) || !(ate instanceof Date) || ate <= de) return 0
  if (!DIAS.some((d) => h.semana[d].length)) return Math.floor((ate.getTime() - de.getTime()) / 60000)
  let total = 0
  let dia = noFuso(de, fuso).hoje
  for (let n = 0; n < 400; n++) {
    for (const i of intervalosDoDia(h, dia)) {
      const ini = Math.max(instanteLocal(dia, i.abre, fuso).getTime(), de.getTime())
      const fim = Math.min(instanteLocal(dia, i.fecha, fuso).getTime(), ate.getTime())
      if (fim > ini) total += Math.floor((fim - ini) / 60000)
    }
    dia = somarDias(dia, 1)
    if (instanteLocal(dia, '00:00', fuso) >= ate) break
  }
  return total
}

/** Resumo legível da semana: "seg–sex 09:00–18:00 · sáb 09:00–12:00" (dias seguidos com o mesmo horário juntos). */
export function resumoDoHorario(h: Horario): string {
  const NOMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  const txt = (d: number) => h.semana[String(d) as keyof Semana].map((i) => `${i.abre}–${i.fecha}`).join(', ')
  const partes: string[] = []
  for (let k = 0; k < ordem.length; k++) {
    const d = ordem[k]; const t = txt(d)
    if (!t) continue
    let fim = k
    while (fim + 1 < ordem.length && txt(ordem[fim + 1]) === t) fim++
    partes.push(`${NOMES[d]}${fim > k ? '–' + NOMES[ordem[fim]] : ''} ${t}`)
    k = fim
  }
  return partes.join(' · ') || 'fechado todos os dias'
}
