'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Os rótulos que o segmento (ou o dono) deu às telas, disponíveis para a barra do topo.
 *
 * POR QUE ISTO EXISTE: o menu já renomeia telas por segmento — na imobiliária,
 * "Leads" é "Pipeline" e "Executivo" é "Dashboard Executivo". A barra do topo, porém,
 * recebia o título escrito à mão dentro de cada tela, então o menu dizia "Pipeline" e
 * o topo da mesma página dizia "Leads". Quem usa não sabe se são dois lugares.
 *
 * O layout já busca esses rótulos para montar a sidebar; aqui eles só passam adiante,
 * sem consulta nova. Rota sem rótulo próprio mantém o título que a tela escreveu.
 */

const RotulosContext = createContext<Record<string, string>>({})

export function RotulosProvider({ valor, children }: { valor: Record<string, string>; children: ReactNode }) {
  return <RotulosContext.Provider value={valor}>{children}</RotulosContext.Provider>
}

/**
 * Rótulo da rota atual, se o segmento tiver renomeado.
 *
 * Resolve pela PRIMEIRA parte do caminho (`/leads/123` → `/leads`), que é a mesma
 * chave que o menu usa — senão tela com sub-rota perderia o nome.
 */
export function useRotuloDaRota(): string | undefined {
  const rotulos = useContext(RotulosContext)
  const pathname = usePathname()
  if (!pathname) return undefined
  const raiz = '/' + (pathname.split('/')[1] ?? '')
  return rotulos[raiz]
}
