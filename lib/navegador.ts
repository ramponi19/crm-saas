'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Leitura de coisas que só existem no navegador, sem render duplo.
 *
 * ⚠️ O PROBLEMA QUE ISTO RESOLVE. O padrão espalhado pelo CRM era:
 *
 *     const [base, setBase] = useState('')
 *     useEffect(() => { setBase(window.location.origin) }, [])
 *
 * Funciona, mas custa DOIS renders em toda montagem: o primeiro com o valor
 * vazio, o efeito dispara, o segundo com o valor certo. Onze lugares faziam
 * isso — incluindo quatro cartões de Configurações e a tela de Integrações.
 *
 * `useSyncExternalStore` é a ferramenta que o React criou exatamente para isso:
 * ela sabe ler uma fonte externa durante a renderização, com um valor separado
 * para o servidor (onde `window` não existe). Nada de efeito, nada de segundo
 * render — e a regra `set-state-in-effect` deixa de acusar porque não há
 * `setState` nenhum.
 *
 * Por que não `useState(() => window.location.origin)`: o inicializador roda
 * também na hidratação, e o valor divergiria do que o servidor renderizou.
 */

/** Nada a assinar: nem a origem nem a preferência de movimento mudam em uso. */
const semAssinatura = () => () => {}

/**
 * `https://exemplo.com` — vazio durante a renderização no servidor.
 *
 * Vazio é o certo ali: o servidor não sabe por qual domínio a pessoa chegou, e
 * inventar um faria a URL copiada pelo lojista apontar para o lugar errado.
 */
export function useOrigem(): string {
  return useSyncExternalStore(
    semAssinatura,
    () => window.location.origin,
    () => '',
  )
}

/** `true` quando o sistema pede menos animação. Falso no servidor. */
export function usePrefereMenosMovimento(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', avisar)
      return () => mq.removeEventListener('change', avisar)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

/**
 * Cache do valor cru por chave.
 *
 * `useSyncExternalStore` exige que `getSnapshot` devolva a MESMA referência
 * enquanto nada muda — devolver um objeto novo a cada chamada faz o React
 * entrar em laço infinito de render. Por isso o valor analisado fica guardado,
 * indexado pelo texto cru que o veio.
 */
const cache = new Map<string, { cru: string | null; valor: unknown }>()

function lerCru(chave: string): string | null {
  try { return localStorage.getItem(chave) } catch { return null }
}

/**
 * Leitura de `localStorage` que acompanha mudança feita em OUTRA aba.
 *
 * O evento `storage` só dispara entre abas, então a escrita local avisa os
 * assinantes por conta própria — senão a própria aba que grava não se atualiza.
 */
const ouvintes = new Set<() => void>()
const avisarTodos = () => { for (const o of ouvintes) o() }

export function useLocalStorage<T>(chave: string, padrao: T): [T, (valor: T) => void] {
  const assinar = useCallback((avisar: () => void) => {
    ouvintes.add(avisar)
    window.addEventListener('storage', avisar)
    return () => { ouvintes.delete(avisar); window.removeEventListener('storage', avisar) }
  }, [])

  const ler = useCallback((): T => {
    const cru = lerCru(chave)
    const guardado = cache.get(chave)
    if (guardado && guardado.cru === cru) return guardado.valor as T
    let valor: T = padrao
    if (cru != null) {
      try { valor = JSON.parse(cru) as T } catch { valor = padrao }
    }
    cache.set(chave, { cru, valor })
    return valor
  }, [chave, padrao])

  const valor = useSyncExternalStore(assinar, ler, () => padrao)

  const gravar = useCallback((novo: T) => {
    try { localStorage.setItem(chave, JSON.stringify(novo)) } catch { /* modo privado */ }
    cache.delete(chave)
    avisarTodos()
  }, [chave])

  return [valor, gravar]
}
