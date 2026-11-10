/**
 * O RITMO DAS CONSULTAS AO VIVO DO ZAPINTEL — a regra, sem React (21/10/2026).
 *
 * Fica separado do `useRpcAoVivo` para que o teste meça a MESMA conta que o
 * hook faz (tests/zapintel-ritmo.test.ts): quantas consultas uma aba dispara
 * com mensagens chegando, ficha refeita, aba escondida.
 */
import type { OpcoesAoVivo } from "./useRpcAoVivo";

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

/*
 * ══ A TRAVA DO DASHBOARD (10/11/2026, pedido do Lucas) ══════════════════════
 *
 * Todas as abas recebem o mesmo aviso no mesmo instante; com o respiro fixo de
 * 2,5 s elas disparavam juntas — N abas = N dashboards ao mesmo tempo no banco.
 * Agora: um sorteio de 0 a 5 s SOMADO ao que faltar do teto (se o sorteio só
 * substituísse o respiro, as abas que partilham o mesmo "última consulta"
 * venceriam o teto no mesmo milissegundo e disparariam juntas de novo), e a aba
 * que começa a consultar avisa as irmãs — quem disparar depois vê que já há uma
 * consulta mais nova que o aviso e não repete.
 */

/** Um sorteio inteiro em [min, max] (ms). */
export function sorteioEntre(min: number, max: number, aleatorio: () => number = Math.random): number {
  return min + Math.floor(aleatorio() * (max - min + 1));
}

/** Espera de um aviso com sorteio: o que faltar do teto, MAIS o sorteio. */
export function esperaComSorteio(agora: number, ultimaConsulta: number, intervalo: number, sorteio: number): number {
  return Math.max(0, ultimaConsulta + intervalo - agora) + sorteio;
}

/**
 * Na hora do disparo: `nada` se alguma consulta (desta aba ou de uma irmã) já
 * começou depois do último aviso — os dados dela já contam esse aviso; `esperar`
 * se o teto ainda não passou (uma irmã consultou no meio); `consultar` no resto.
 */
export function decidirDisparo(agora: number, ultimaConsulta: number, ultimoAviso: number, intervalo: number): "nada" | "esperar" | "consultar" {
  if (ultimaConsulta >= ultimoAviso) return "nada";
  if (agora - ultimaConsulta < intervalo) return "esperar";
  return "consultar";
}

/** A trava do dashboard (`useDashboardAoVivo`): só mensagem, 60 s por aba, sorteio de 0–5 s, nunca escondida, abas partilhando. */
export const TRAVA_DO_DASHBOARD: OpcoesAoVivo = {
  eventos: ["mensagens"],
  intervaloMinimo: 60_000,
  sorteio: [0, 5_000],
  soVisivel: true,
  partilhar: true,
};
