/**
 * O RITMO DAS CONSULTAS AO VIVO DO ZAPINTEL — a regra, sem React (21/10/2026).
 *
 * Fica separado do `useRpcAoVivo` para que o teste meça a MESMA conta que o
 * hook faz (tests/zapintel-ritmo.test.ts): quantas consultas uma aba dispara
 * com mensagens chegando, ficha refeita, aba escondida.
 */

/** Espera depois do último aviso de uma rajada: 12 mensagens viram UMA consulta. */
export const RESPIRO = 2500
/** Teto padrão: no máximo uma consulta a cada 20 s por aba. */
export const INTERVALO_MINIMO = 20_000

/** Este aviso refaz a consulta? Sem lista de eventos, todo aviso refaz. */
export function avisoRefaz(evento: string | undefined, eventos: string[] | null): boolean {
  return !eventos || eventos.includes(evento ?? '')
}

/** Quanto esperar, depois de um aviso, até consultar: o respiro da rajada ou o fim do teto, o que vier por último. */
export function esperaDoAviso(agora: number, ultimaConsulta: number, intervalo: number): number {
  return Math.max(RESPIRO, ultimaConsulta + intervalo - agora)
}

/** Quanto esperar ao voltar de segundo plano com consulta atrasada: o que faltar do teto (0 se já passou). */
export function esperaDaVolta(agora: number, ultimaConsulta: number, intervalo: number): number {
  return Math.max(0, ultimaConsulta + intervalo - agora)
}
