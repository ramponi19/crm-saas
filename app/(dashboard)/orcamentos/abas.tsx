'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Tabs } from '@/components/ui'

/**
 * As abas de Orçamentos.
 *
 * A ordem é a do balcão: cota-se primeiro (é o que se faz com o cliente na
 * frente), depois vem o que se emite, e por último as duas telas de
 * parametrização. Preços e Checklist ficam no fim porque se mexe nelas uma vez
 * por mês, não uma vez por atendimento.
 */
const ABAS = [
  { href: '/orcamentos/cotacao', label: 'Nova cotação' },
  { href: '/orcamentos', label: 'Orçamentos' },
  { href: '/orcamentos/precos', label: 'Preços' },
  { href: '/orcamentos/checklist', label: 'Checklist' },
]

export function AbasOrcamentos() {
  const pathname = usePathname()
  const router = useRouter()

  /**
   * A aba ativa é o href MAIS LONGO que casa com o caminho.
   *
   * Comparação por igualdade deixaria uma sub-rota futura
   * (`/orcamentos/precos/regras`) sem nenhuma aba marcada; e casar por prefixo
   * sem ordenar faria `/orcamentos` — prefixo de todos — vencer sempre, com a
   * aba errada acesa em todas as telas.
   */
  const ativa = ABAS
    .filter((a) => pathname === a.href || pathname.startsWith(a.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/orcamentos'

  return (
    <Tabs
      items={ABAS.map((a) => ({ value: a.href, label: a.label }))}
      value={ativa}
      onValueChange={(href) => router.push(href)}
    />
  )
}
