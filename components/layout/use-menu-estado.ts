'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Como a pessoa deixou o menu: recolhido em trilho ou aberto, e quais grupos ela
 * fechou. Fica no navegador (é preferência de tela, não dado da empresa) e vale
 * para a sidebar inteira.
 *
 * `useSyncExternalStore` e não `useState` + efeito: o servidor não tem
 * localStorage, então ele desenha o padrão e o navegador troca pelo guardado
 * sem aviso de hidratação — e sem `setState` dentro de efeito, que o lint barra.
 *
 * localStorage pode não existir (aba anônima, bloqueio): aí vale o padrão e nada
 * quebra.
 */
export interface EstadoMenu {
  recolhido: boolean
  fechados: string[]
}

const CHAVE = 'nexus_menu_v1'
const PADRAO: EstadoMenu = { recolhido: false, fechados: [] }
const ouvintes = new Set<() => void>()
let cache: { cru: string | null; valor: EstadoMenu } = { cru: null, valor: PADRAO }

function ler(): EstadoMenu {
  let cru: string | null = null
  try { cru = window.localStorage.getItem(CHAVE) } catch { return PADRAO }
  if (cru === cache.cru) return cache.valor
  let valor = PADRAO
  try {
    const j = cru ? (JSON.parse(cru) as Partial<EstadoMenu>) : null
    if (j) valor = { recolhido: j.recolhido === true, fechados: Array.isArray(j.fechados) ? j.fechados.filter((x) => typeof x === 'string') : [] }
  } catch { /* guardado corrompido: vale o padrão */ }
  cache = { cru, valor }
  return valor
}

function gravar(novo: EstadoMenu) {
  try { window.localStorage.setItem(CHAVE, JSON.stringify(novo)) } catch { /* sem armazenamento: só não lembra */ }
  ouvintes.forEach((f) => f())
}

function assinar(f: () => void) {
  ouvintes.add(f)
  const deOutraAba = (e: StorageEvent) => { if (e.key === CHAVE) f() }
  window.addEventListener('storage', deOutraAba)
  return () => { ouvintes.delete(f); window.removeEventListener('storage', deOutraAba) }
}

export function useMenuEstado() {
  const estado = useSyncExternalStore(assinar, ler, () => PADRAO)
  const alternarRecolhido = useCallback(() => {
    const atual = ler()
    gravar({ ...atual, recolhido: !atual.recolhido })
  }, [])
  const alternarGrupo = useCallback((id: string) => {
    const atual = ler()
    const fechados = atual.fechados.includes(id) ? atual.fechados.filter((x) => x !== id) : [...atual.fechados, id]
    gravar({ ...atual, fechados })
  }, [])
  return { ...estado, alternarRecolhido, alternarGrupo }
}
