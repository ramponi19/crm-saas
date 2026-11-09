'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { FUSO_PADRAO } from '@/lib/datas'

/**
 * O fuso da empresa para os componentes de navegador (10/11/2026).
 *
 * O layout lê o fuso no servidor (`fusoDaEmpresa`) e passa por aqui. Um componente
 * que mostra ou corta datas pede `useFuso()` e entrega às funções de `lib/datas` —
 * assim o texto do servidor e o do navegador saem iguais (sem o #418) e o dia é o
 * da loja, não o do computador de quem abriu a tela.
 */
const FusoContext = createContext<string>(FUSO_PADRAO)

export function FusoProvider({ fuso, children }: { fuso: string; children: ReactNode }) {
  return <FusoContext.Provider value={fuso}>{children}</FusoContext.Provider>
}

/** O fuso da empresa da tela (padrão Brasília fora do provedor). */
export function useFuso(): string {
  return useContext(FusoContext)
}
