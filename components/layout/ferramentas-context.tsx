'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * As FERRAMENTAS liberadas para quem está logado (etapa 0, 21/10/2026).
 *
 * Simular parcela, Check IMEI e Consulta FIPE saíram do menu lateral: são
 * ferramentas, não áreas. Cada uma mora dentro da tela onde se usa (Orçamentos,
 * Estoque, Avaliações) e abre pelo ⌘K. As duas pontas precisam saber se a
 * ferramenta está liberada, e a resposta é a mesma do menu — o layout já resolve
 * as camadas (`resolverFerramentas`) e só passa adiante, sem consulta nova.
 */
export interface Ferramenta {
  /** Identidade do módulo (o endereço que o libera): '/simular-parcela'… */
  href: string
  label: string
  /** Onde a tela mora agora: '/orcamentos/parcela'… */
  rota: string
}

const FerramentasContext = createContext<Ferramenta[]>([])

export function FerramentasProvider({ valor, children }: { valor: Ferramenta[]; children: ReactNode }) {
  return <FerramentasContext.Provider value={valor}>{children}</FerramentasContext.Provider>
}

export function useFerramentas(): Ferramenta[] {
  return useContext(FerramentasContext)
}

/** A ferramenta deste módulo, se liberada. */
export function useFerramenta(href: string): Ferramenta | undefined {
  return useFerramentas().find((f) => f.href === href)
}
