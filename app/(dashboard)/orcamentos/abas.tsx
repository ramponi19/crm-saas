'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Tabs } from '@/components/ui'
import { useFerramenta } from '@/components/layout/ferramentas-context'

/**
 * As abas de Orçamentos.
 *
 * A ordem é a do balcão: cota-se primeiro (é o que se faz com o cliente na
 * frente), depois vem o que se emite, e por último as duas telas de
 * parametrização. Preços e Checklist ficam no fim porque se mexe nelas uma vez
 * por mês, não uma vez por atendimento.
 */
const COTACAO = { href: '/orcamentos/cotacao', label: 'Nova cotação' }
const LISTA = { href: '/orcamentos', label: 'Orçamentos' }
const PARAMETROS = [
  { href: '/orcamentos/precos', label: 'Preços' },
  { href: '/orcamentos/checklist', label: 'Checklist' },
]

/**
 * `cotacao`: a empresa tem a cotação de troca (decidido no layout, no servidor).
 * Simular parcela entra como aba quando a ferramenta está liberada (etapa 0:
 * saiu do menu lateral) — logo depois da lista, porque é o que se usa com o
 * cliente na frente, antes dos parâmetros.
 */
export function AbasOrcamentos({ cotacao }: { cotacao: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const parcela = useFerramenta('/simular-parcela')
  const ABAS = [
    ...(cotacao ? [COTACAO] : []),
    LISTA,
    ...(parcela ? [{ href: parcela.rota, label: parcela.label }] : []),
    ...(cotacao ? PARAMETROS : []),
  ]

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

  // Uma aba só é ruído: sem cotação nem parcela, a tela fica como sempre foi.
  if (ABAS.length < 2) return null

  return (
    <div className="shrink-0 px-4 sm:px-6">
    <Tabs
      items={ABAS.map((a) => ({ value: a.href, label: a.label }))}
      value={ativa}
      onValueChange={(href) => router.push(href)}
    />
    </div>
  )
}
