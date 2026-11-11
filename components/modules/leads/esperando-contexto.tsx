'use client'

import { createContext, useContext } from 'react'
import type { MapaEsperando } from '@/lib/esperando'

/**
 * Quem espera resposta no quadro, pela regra única do banco (`lib/esperando.ts`,
 * 11/11/2026). O quadro lê uma vez (e de novo a cada recontagem); cada cartão
 * consulta aqui em vez de refazer a conta com as datas do próprio lead.
 * Sem provider (cartão fora do quadro), o cartão usa a comparação de antes.
 */
const Ctx = createContext<MapaEsperando | null>(null)

export const EsperandoProvider = Ctx.Provider

export function useEsperando(): MapaEsperando | null {
  return useContext(Ctx)
}
