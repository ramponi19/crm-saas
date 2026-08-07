'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TabItem {
  value: string
  label: React.ReactNode
  badge?: React.ReactNode
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/**
 * Tabs com sublinhado cobalto no item ativo (estilo Linear/Stripe).
 *
 * A faixa rola na horizontal quando não cabe, e a barra de rolagem é escondida
 * de propósito. Só isso deixava abas INALCANÇÁVEIS: em Configurações são 14, as
 * 6 últimas ficavam fora da tela e, sem barra nem seta, no desktop com mouse não
 * havia como chegar nelas (shift+roda funciona, mas ninguém adivinha). Daí as
 * setas — que só aparecem quando existe conteúdo para aquele lado.
 */
export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  const faixa = useRef<HTMLDivElement>(null)
  const [temAntes, setTemAntes] = useState(false)
  const [temDepois, setTemDepois] = useState(false)

  const medir = useCallback(() => {
    const el = faixa.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setTemAntes(el.scrollLeft > 1)
    setTemDepois(el.scrollLeft < max - 1)
  }, [])

  useEffect(() => {
    const el = faixa.current
    if (!el) return
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    el.addEventListener('scroll', medir, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', medir)
    }
  }, [medir, items.length])

  // Traz a aba ativa para a área visível. Sem isso, abrir a tela já numa aba do
  // fim mostra a faixa no começo e parece que nenhuma está selecionada.
  useEffect(() => {
    faixa.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value])

  function rolar(direcao: 1 | -1) {
    const el = faixa.current
    if (!el) return
    el.scrollBy({ left: direcao * Math.max(220, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  const seta = 'absolute top-1/2 z-10 -translate-y-1/2 grid h-[22px] w-[22px] place-items-center rounded-full border border-line bg-raised text-ink-2 shadow-sm transition-colors hover:text-ink'

  // O className continua indo para a FAIXA, não para o invólucro novo: seis telas
  // passam "border-b-0" para tirar a linha, e no invólucro isso não teria efeito.
  return (
    <div className="relative min-w-0">
      <div
        ref={faixa}
        role="tablist"
        className={cn('flex min-w-0 items-center gap-1 overflow-x-auto border-b border-line scrollbar-none', className)}
      >
        {items.map((it) => {
          const active = it.value === value
          return (
            <button
              key={it.value}
              role="tab"
              aria-selected={active}
              onClick={() => onValueChange(it.value)}
              className={cn(
                'relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                active
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {it.label}
              {it.badge != null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-semibold',
                    active ? 'bg-accent-soft text-accent' : 'bg-ink/[0.05] text-ink-3',
                  )}
                >
                  {it.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {temAntes && (
        <button type="button" aria-label="Ver abas anteriores" onClick={() => rolar(-1)} className={cn(seta, 'left-0')}>
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
      )}
      {temDepois && (
        <button type="button" aria-label="Ver mais abas" onClick={() => rolar(1)} className={cn(seta, 'right-0')}>
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
