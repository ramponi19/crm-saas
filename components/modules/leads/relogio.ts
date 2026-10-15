/**
 * RELÓGIO DO QUADRO DE LEADS — um só para a página inteira.
 *
 * Cada cartão tinha o próprio `setInterval` de 30 s: com ~2.000 cartões, eram
 * 2.000 timers, e a cada tique TODOS se redesenhavam, mudasse o texto ou não. E
 * o tempo mostrado podia ficar até 30 s atrasado depois de abrir a tela — ou
 * minutos, ao voltar pelo "voltar" do navegador, que reaproveita a página.
 *
 * Aqui há um timer só, ligado enquanto houver cartão na tela. O cartão lê o
 * relógio com `useSyncExternalStore` e só se redesenha quando o que ele MOSTRA
 * muda ("há X min", cor do SLA, score). No servidor e na hidratação, o cartão
 * usa o instante que veio do servidor (ver leads/page.tsx) — o 1º desenho sai
 * igual nos dois lados e não há erro de hidratação; logo depois, o React acerta
 * sozinho o que mudou.
 */

type Ouvinte = () => void

/** Folga máxima do "há X min" na tela. Medido com 2.000 cartões (ver o commit). */
const TIQUE_MS = 10_000

const ouvintes = new Set<Ouvinte>()
let atual = typeof window === 'undefined' ? 0 : Date.now()
let timer: ReturnType<typeof setInterval> | null = null

function tique() {
  atual = Date.now()
  ouvintes.forEach((o) => o())
}

function aoVoltarAVer() {
  if (document.visibilityState === 'visible') tique()
}

/**
 * Instante corrente do relógio (o último tique). Com o relógio PARADO — nenhum
 * cartão inscrito ainda, como no 1º desenho ao chegar à tela —, vale a
 * `reserva`: o instante que o cartão recebeu do servidor. A inscrição, logo em
 * seguida, acerta a hora.
 */
export function instanteDoRelogio(reserva?: number): number {
  return timer === null && reserva !== undefined ? reserva : atual
}

/**
 * Inscreve um cartão. O primeiro liga o timer e acerta a hora na hora: a tela
 * pode estar voltando de outra página, com o relógio parado desde então. Aba
 * que volta a ficar visível também acerta — o navegador freia timers de abas
 * em segundo plano.
 */
export function assinarRelogio(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  if (ouvintes.size === 1) {
    timer = setInterval(tique, TIQUE_MS)
    document.addEventListener('visibilitychange', aoVoltarAVer)
    window.addEventListener('pageshow', tique)
    tique()
  }
  return () => {
    ouvintes.delete(ouvinte)
    if (ouvintes.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', aoVoltarAVer)
      window.removeEventListener('pageshow', tique)
    }
  }
}
