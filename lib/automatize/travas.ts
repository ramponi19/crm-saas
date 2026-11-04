/**
 * AS TRAVAS DO ENVIO AUTOMÁTICO (Automatize, decisões do Lucas, 04/11/2026).
 *
 * Funções puras (sem banco) para dar para testar sozinhas. Quem decide é o
 * executor em lib/automacoes.ts; aqui só a regra:
 *  - horário de atendimento da empresa (configuracoes_sistema `horario_comercial`;
 *    sem configuração, o padrão do app: seg–sex, 09:00–18:00) — fora dele, a ação
 *    vai para o próximo início de horário;
 *  - no máximo 1 envio do MESMO modelo para o mesmo contato a cada 7 dias;
 *  - no máximo 50 envios automáticos por hora por empresa (o excedente fica na
 *    fila, não é descartado).
 * Fuso fixo: America/Sao_Paulo (o Brasil não tem horário de verão desde 2019).
 */

export interface Horario { inicio: string; fim: string; dias: number[] }

export const HORARIO_PADRAO: Horario = { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5] }
export const TETO_POR_HORA = 50
export const JANELA_MODELO_DIAS = 7

const OFFSET_SP_MIN = -180 // UTC-3

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0)
  return h * 60 + m
}

/** "Relógio de parede" de São Paulo para um instante UTC. */
function emSaoPaulo(agora: Date): { dia: number; min: number; meiaNoiteUtc: number } {
  const local = new Date(agora.getTime() + OFFSET_SP_MIN * 60_000)
  const dia = local.getUTCDay()
  const min = local.getUTCHours() * 60 + local.getUTCMinutes()
  const meiaNoiteUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_SP_MIN * 60_000
  return { dia, min, meiaNoiteUtc }
}

/** Normaliza o que vem do banco; qualquer coisa estranha cai no padrão. */
export function horarioValido(h: unknown): Horario {
  const x = (h ?? {}) as Partial<Horario>
  const ok = typeof x.inicio === 'string' && typeof x.fim === 'string' && Array.isArray(x.dias) && x.dias.length > 0
    && minutos(x.fim) > minutos(x.inicio)
  return ok ? { inicio: x.inicio!, fim: x.fim!, dias: x.dias!.map(Number) } : HORARIO_PADRAO
}

/** Está dentro do horário de atendimento agora? */
export function dentroDoHorario(agora: Date, h: Horario): boolean {
  const { dia, min } = emSaoPaulo(agora)
  return h.dias.includes(dia) && min >= minutos(h.inicio) && min < minutos(h.fim)
}

/** O instante em que a ação pode rodar: agora, se dentro do horário; senão o próximo início. */
export function proximoHorario(agora: Date, h: Horario): Date {
  if (dentroDoHorario(agora, h)) return agora
  const { dia, min, meiaNoiteUtc } = emSaoPaulo(agora)
  const ini = minutos(h.inicio)
  for (let d = 0; d <= 7; d++) {
    const diaSemana = (dia + d) % 7
    if (!h.dias.includes(diaSemana)) continue
    if (d === 0 && min >= ini) continue // hoje já passou do início
    return new Date(meiaNoiteUtc + d * 86_400_000 + ini * 60_000)
  }
  return agora // sem nenhum dia marcado (não acontece com horarioValido)
}

/** Já mandou este modelo para este contato nos últimos 7 dias? */
export function modeloRecente(ultimoEnvio: Date | null, agora: Date): boolean {
  return !!ultimoEnvio && agora.getTime() - ultimoEnvio.getTime() < JANELA_MODELO_DIAS * 86_400_000
}

/** Chegou no teto de envios automáticos da hora? */
export function tetoAtingido(enviadosNaUltimaHora: number): boolean {
  return enviadosNaUltimaHora >= TETO_POR_HORA
}

/** Quando a ação de "esperar N dias" deve rodar. */
export function agendarPara(agora: Date, esperaDias: number): Date {
  return new Date(agora.getTime() + Math.max(0, Math.min(90, Math.floor(esperaDias || 0))) * 86_400_000)
}
