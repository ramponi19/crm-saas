/**
 * A JANELA DA META FOI BLOQUEADA? (23/11/2026)
 *
 * O WhatsApp conecta pelo SDK da Meta (`FB.login`), que abre uma janela com `window.open` dentro
 * do próprio clique. Quando o navegador bloqueia pop-up, `window.open` devolve `null` e o SDK não
 * chama o retorno: o botão ficava em "Aguardando a Meta…" para sempre, sem aviso (visto na
 * verificação de produção de 23/11). Aqui o `window.open` é vigiado só durante a chamada: se
 * devolveu `null`, a tela sabe que a janela não abriu e volta o botão ao normal com o aviso.
 * Instagram e Messenger conectam por redirecionamento (a página inteira vai e volta): sem janela.
 */
export interface ResultadoJanela {
  /** O código tentou abrir uma janela e o navegador devolveu `null`. */
  bloqueada: boolean
  /** Abriu pelo menos uma janela. */
  abriu: boolean
}

export const AVISO_JANELA_BLOQUEADA = 'Seu navegador bloqueou a janela da Meta. Permita pop-ups para este site e tente de novo.'

export function abrirVigiandoJanela(alvo: { open: (...args: never[]) => unknown }, abrir: () => void): ResultadoJanela {
  const original = alvo.open
  const r: ResultadoJanela = { bloqueada: false, abriu: false }
  alvo.open = function (this: unknown, ...args: never[]) {
    const janela = (original as (...a: never[]) => unknown).apply(this ?? alvo, args)
    if (janela) r.abriu = true
    else r.bloqueada = true
    return janela
  }
  try {
    abrir()
  } finally {
    alvo.open = original
  }
  return r
}
