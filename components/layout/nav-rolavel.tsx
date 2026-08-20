'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A lista de menu que ROLA e diz que rola.
 *
 * O `overflow-y-auto` já existia nas três barras, e tecnicamente funcionava: com o
 * cursor sobre o menu, a roda desce. Só que numa tela de notebook a imobiliária tem
 * 19 itens e sobram 318px cortados — sem barra à vista (ela é fina e só aparece
 * durante o gesto), sem degradê, e com o item da página aberta muitas vezes ABAIXO
 * do corte. Medido em 20/08/2026 em /ranking: o menu marcava a página atual num
 * item que ninguém tinha como ver, com scrollTop em zero. Quem olha conclui que o
 * menu acabou ali — e a conclusão é razoável.
 *
 * Três coisas, então:
 *  - rola até o item ativo quando a tela abre, se ele estiver fora de vista;
 *  - mostra um degradê em cima e/ou embaixo enquanto houver conteúdo escondido
 *    naquela direção — o aviso desaparece quando não há mais nada, para não virar
 *    enfeite permanente;
 *  - o `min-h-0` fica aqui, e não na tela, porque é dele que depende o encolher.
 *
 * A cor do degradê vem de fora, de dois jeitos porque as barras pintam o fundo de
 * dois jeitos: a do CRM usa a variável do tema branco (`--sb-bg`, que o dono muda),
 * e as de administração usam o token `raised` do Precisão, que é cor literal no
 * Tailwind. Daí `corFundo` (valor CSS) ou `classeGradiente` (`from-raised`) — repetir
 * o hexadecimal aqui seria a semente da próxima divergência de cor.
 */
export function NavRolavel({
  children,
  corFundo,
  classeGradiente,
  className = '',
  style,
}: {
  children: ReactNode
  corFundo?: string
  classeGradiente?: string
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLElement>(null)
  const [cortado, setCortado] = useState({ acima: false, abaixo: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const medir = () => {
      const sobra = el.scrollHeight - el.clientHeight - el.scrollTop
      setCortado({ acima: el.scrollTop > 4, abaixo: sobra > 4 })
    }

    /**
     * Rola até o item da página aberta — uma vez, no primeiro desenho.
     *
     * `block: 'nearest'` de propósito: centralizar jogaria o topo do menu para fora
     * mesmo quando o item já estava visível, e o menu abriria "torto" em toda tela
     * cujo item cabe na área.
     */
    const ativo = el.querySelector('[data-ativo="true"]')
    if (ativo) {
      const r = ativo.getBoundingClientRect()
      const rn = el.getBoundingClientRect()
      if (r.top < rn.top || r.bottom > rn.bottom) ativo.scrollIntoView({ block: 'nearest' })
    }
    medir()

    el.addEventListener('scroll', medir, { passive: true })
    // A altura muda sem rolar: janela redimensionada, zoom, item novo no menu.
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    for (const filho of Array.from(el.children)) ro.observe(filho)
    return () => { el.removeEventListener('scroll', medir); ro.disconnect() }
  }, [])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <nav ref={ref} className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin ${className}`} style={style}>
        {children}
      </nav>
      {/* Avisos de conteúdo escondido. `pointer-events-none` para não roubar o clique
          do item que está exatamente embaixo deles. */}
      {cortado.acima && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-5 ${classeGradiente ? `bg-gradient-to-b ${classeGradiente} to-transparent` : ''}`}
          style={corFundo ? { background: `linear-gradient(to bottom, ${corFundo}, transparent)` } : undefined}
        />
      )}
      {cortado.abaixo && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-6 ${classeGradiente ? `bg-gradient-to-t ${classeGradiente} to-transparent` : ''}`}
          style={corFundo ? { background: `linear-gradient(to top, ${corFundo}, transparent)` } : undefined}
        />
      )}
    </div>
  )
}
