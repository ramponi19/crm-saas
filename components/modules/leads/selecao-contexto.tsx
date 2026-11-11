'use client'

import { createContext, useContext } from 'react'

/**
 * Seleção de cartões do quadro para ação em lote (etiquetar, 11/11/2026). Nulo = o quadro
 * não está em modo de seleção: o clique no cartão abre o lead, como sempre.
 */
const Ctx = createContext<ReadonlySet<number> | null>(null)

export const SelecaoProvider = Ctx.Provider

export function useSelecao(): ReadonlySet<number> | null {
  return useContext(Ctx)
}
