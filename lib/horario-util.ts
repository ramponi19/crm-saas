import { FUSO_PADRAO, diaNoFuso, instanteLocal, partesNoFuso, somarDias } from '@/lib/datas'

/**
 * Minutos ÚTEIS entre dois instantes, segundo o horário de funcionamento da loja.
 *
 * Existe por causa da devolução de lead à esteira: contar 24h faria o lead que
 * chega 22h ser devolvido 22h15 com a loja fechada e ninguém tendo falhado. O
 * relógio pausa quando a loja fecha e retoma quando abre.
 */

export interface HorarioLoja {
  /** "09:00" */
  inicio: string
  /** "18:00" */
  fim: string
  /** Dias da semana atendidos, 0=domingo … 6=sábado. */
  dias: number[]
}

export const HORARIO_PADRAO: HorarioLoja = { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5] }

/** "09:30" → 570. Valor inválido devolve null para o chamador decidir. */
export function minutosDoDia(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim())
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Fuso: o horário da loja é local (o fuso da empresa, padrão Brasília), e o servidor
 * roda em UTC. Comparar a hora UTC com "09:00" abriria a loja às 6 da manhã.
 * Converte-se o instante para a hora local antes de decidir se está aberto.
 */
function partesLocais(d: Date, fuso: string): { diaSemana: number; minutos: number; dia: string } {
  const p = partesNoFuso(d, fuso)
  return { diaSemana: p.diaSemana, minutos: p.hora * 60 + p.minuto, dia: diaNoFuso(d, fuso) }
}

/**
 * Quantos minutos de EXPEDIENTE se passaram entre `de` e `ate`.
 *
 * Varre minuto a minuto seria simples e lento; varre-se DIA a dia, somando a
 * interseção do expediente com o intervalo. Limite de 400 dias para um `de`
 * corrompido não virar laço infinito.
 */
export function minutosUteis(de: Date, ate: Date, horario: HorarioLoja, fuso: string = FUSO_PADRAO): number {
  if (!(de instanceof Date) || !(ate instanceof Date)) return 0
  if (ate <= de) return 0

  const abre = minutosDoDia(horario.inicio)
  const fecha = minutosDoDia(horario.fim)
  const dias = Array.isArray(horario.dias) ? horario.dias : []
  // Configuração sem sentido (loja fechada todo dia, ou fim antes do início):
  // devolve o tempo corrido, senão o prazo nunca venceria e a regra sumiria.
  if (abre == null || fecha == null || fecha <= abre || dias.length === 0) {
    return Math.floor((ate.getTime() - de.getTime()) / 60000)
  }

  let total = 0
  const cursor = new Date(de.getTime())
  for (let i = 0; i < 400; i++) {
    const { diaSemana, minutos: minAtual, dia } = partesLocais(cursor, fuso)

    if (dias.includes(diaSemana)) {
      // Fim do expediente DESTE dia, em instante absoluto.
      const fimExpediente = new Date(cursor.getTime() + (fecha - minAtual) * 60000)
      const inicioContagem = Math.max(minAtual, abre)
      const fimContagem = Math.min(fecha, minAtual + Math.floor((ate.getTime() - cursor.getTime()) / 60000))
      if (fimContagem > inicioContagem) total += fimContagem - inicioContagem
      if (ate <= fimExpediente) break
    }

    // Pula para 00:00 do dia seguinte, no fuso da loja.
    const proximo = instanteLocal(somarDias(dia, 1), '00:00', fuso)
    if (proximo <= cursor) break
    if (proximo >= ate) break
    cursor.setTime(proximo.getTime())
  }
  return total
}

