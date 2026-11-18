import { permanentRedirect } from 'next/navigation'

/**
 * /para/<ramo> — as antigas páginas de venda por ramo (18/11/2026). O Nexus passou a
 * ser um plano único com módulos na Central e deixou de se vender por ramo: link
 * antigo e buscador vão para a home com redirecionamento permanente (308).
 */
export default function ParaPage(): never {
  permanentRedirect('/')
}
