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
/**
 * Os MÓDULOS LIGADOS da empresa (endereços, `ligadosDaEmpresa`), para o navegador perguntar "o módulo
 * está ligado?" (17/11/2026). Diferente das ferramentas: não muda se o dono ocultou o item no menu nem
 * com o papel de quem está logado — o que é do módulo aparece quando a EMPRESA tem o módulo.
 */
const LigadosContext = createContext<ReadonlySet<string>>(new Set())

export function FerramentasProvider({ valor, ligados = [], children }: { valor: Ferramenta[]; ligados?: string[]; children: ReactNode }) {
  return (
    <FerramentasContext.Provider value={valor}>
      <LigadosContext.Provider value={new Set(ligados)}>{children}</LigadosContext.Provider>
    </FerramentasContext.Provider>
  )
}

/** Os endereços dos módulos ligados para a empresa. */
export function useModulosLigados(): ReadonlySet<string> {
  return useContext(LigadosContext)
}

/** O módulo deste endereço está ligado para a empresa? */
export function useModuloLigado(href: string): boolean {
  return useContext(LigadosContext).has(href)
}

export function useFerramentas(): Ferramenta[] {
  return useContext(FerramentasContext)
}

/** A ferramenta deste módulo, se liberada. */
export function useFerramenta(href: string): Ferramenta | undefined {
  return useFerramentas().find((f) => f.href === href)
}
