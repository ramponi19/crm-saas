'use client'

import { notify } from '@/components/ui'

/**
 * `fetch` para as rotas internas, com um comportamento só para sessão expirada.
 *
 * O problema que isto resolve: quando a sessão morre, o middleware devolve 401 e
 * cada tela mostrava a mensagem crua no toast. O usuário ficava numa página que
 * parece funcionando (ela foi renderizada quando a sessão ainda valia), clicava, e
 * levava um erro que parecia recusa de permissão. Sem redirecionamento, ele
 * continuava clicando e tomando o mesmo erro.
 *
 * Aqui o 401 avisa e leva para a tela de entrada. Recarregar sozinho a página
 * também não serve: o middleware manda o navegador para /login de qualquer forma,
 * mas sem explicar por quê.
 */
export interface RespostaApi<T> {
  ok: boolean
  status: number
  json: T
  /** true quando o 401 veio de sessão perdida — a tela não precisa mostrar erro. */
  sessaoExpirada: boolean
}

export async function apiFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<RespostaApi<T>> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    // Rede caiu / offline: não é sessão, e o chamador precisa poder dizer isso.
    return { ok: false, status: 0, json: { error: 'Sem conexão. Tente novamente.' } as T, sessaoExpirada: false }
  }

  const json = (await res.json().catch(() => ({}))) as T

  if (res.status === 401) {
    notify.warn('Sua sessão expirou', 'Levando você para a tela de entrada…')
    // Delay curto só para o toast ser lido. `location.href` em vez de router.push:
    // o estado do cliente já está velho, e recarregar limpa tudo.
    // Recarga inteira de propósito: a sessão morreu, e `router.push` levaria
    // para o login com todo o estado de cliente da sessão antiga em memória.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    setTimeout(() => { window.location.href = '/login' }, 1600)
    return { ok: false, status: 401, json, sessaoExpirada: true }
  }

  return { ok: res.ok, status: res.status, json, sessaoExpirada: false }
}
