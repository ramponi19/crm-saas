import { chaveDoInstante, diaDaSemana, diaNoFuso, instanteLocal, somarDias } from '@/lib/datas'

/**
 * Os horários do agendamento público, no FUSO DA EMPRESA (10/11/2026).
 *
 * Usado pela tela (/agendar/[slug]) e pela API que grava: os dois lados oferecem e
 * aceitam exatamente os mesmos horários. Antes a tela montava os horários com
 * `setHours` no fuso de quem rodava (UTC no servidor, o do visitante no navegador) e
 * comparava os ocupados pelo TEXTO (`…+00:00` do banco contra `….000Z`): horário
 * ocupado nunca aparecia ocupado, e só o POST barrava (409).
 */
export interface HorarioAgenda { inicio: string; fim: string; dias: number[] }

export const PASSO_MIN = 30
const DIAS_A_OLHAR = 21
const MAX_DIAS = 14

/** Os próximos dias de funcionamento (até 14, olhando 21 à frente), como datas puras do fuso. */
export function diasDeAgenda(horario: HorarioAgenda, agoraMs: number, fuso: string): string[] {
  const hoje = diaNoFuso(new Date(agoraMs), fuso)
  const out: string[] = []
  for (let i = 0; i < DIAS_A_OLHAR && out.length < MAX_DIAS; i++) {
    const dia = somarDias(hoje, i)
    if (horario.dias.includes(diaDaSemana(dia))) out.push(dia)
  }
  return out
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Os horários de um dia (de 30 em 30 min, do início ao fim do expediente), como instantes. */
export function horariosDoDia(dia: string, horario: HorarioAgenda, fuso: string): Date[] {
  const fim = minutos(horario.fim)
  const out: Date[] = []
  for (let m = minutos(horario.inicio); m < fim; m += PASSO_MIN) out.push(instanteLocal(dia, hhmm(m), fuso))
  return out
}

/** Os instantes ocupados, por chave numérica — qualquer que seja o formato do texto. */
export function chavesOcupadas(ocupadas: string[]): Set<number> {
  const s = new Set<number>()
  for (const o of ocupadas) { const k = chaveDoInstante(o); if (k != null) s.add(k) }
  return s
}

/** O instante pedido é um horário que a agenda oferece (dia de funcionamento, dentro do expediente, no passo)? */
export function horarioOferecido(instante: Date, horario: HorarioAgenda, fuso: string): boolean {
  const dia = diaNoFuso(instante, fuso)
  if (!horario.dias.includes(diaDaSemana(dia))) return false
  const t = instante.getTime()
  return horariosDoDia(dia, horario, fuso).some((s) => s.getTime() === t)
}

/** O horário comercial salvo, com o padrão de sempre (09:00–18:00, seg–sex). */
export function horarioDaAgenda(valor: unknown): HorarioAgenda {
  const v = (valor ?? {}) as Partial<HorarioAgenda>
  return {
    inicio: typeof v.inicio === 'string' ? v.inicio : '09:00',
    fim: typeof v.fim === 'string' ? v.fim : '18:00',
    dias: Array.isArray(v.dias) ? v.dias : [1, 2, 3, 4, 5],
  }
}
