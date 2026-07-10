'use client'

/**
 * Marquee — faixa infinita de prova social entre o hero e a narrativa.
 * Loop contínuo via GSAP; a velocidade reage à rolagem (scroll rápido
 * acelera a faixa e ela assenta de volta). Reduced-motion: faixa parada.
 */

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const ITEMS: { text: string; strong?: string }[] = [
  { strong: '247', text: 'empresas ativas' },
  { strong: '31 mil', text: 'leads atendidos' },
  { strong: 'R$ 4,8 mi', text: 'vendidos por mês' },
  { text: 'WhatsApp oficial Meta' },
  { text: 'Pix nativo' },
  { text: 'varejo · imobiliária · veículos · saúde · food · serviços' },
]

export default function Marquee() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      const loop = gsap.to('.lp-marquee-track', {
        xPercent: -100, ease: 'none', duration: 34, repeat: -1,
      })
      ScrollTrigger.create({
        trigger: root, start: 'top bottom', end: 'bottom top',
        onUpdate: (self) => {
          const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 900, 4)
          gsap.to(loop, { timeScale: boost, duration: 0.3, overwrite: true })
          gsap.to(loop, { timeScale: 1, duration: 1.4, delay: 0.35, ease: 'power2.out', overwrite: false })
        },
      })
    }, root)
    return () => ctx.revert()
  }, [])

  const row = (key: string) => (
    <div key={key} className="lp-marquee-track" aria-hidden={key === 'b'}>
      {ITEMS.map((it, i) => (
        <span key={i} className="flex items-center whitespace-nowrap text-[13.5px] font-medium text-[color:var(--lp-faint)]">
          <span className="mx-7 h-1 w-1 rounded-full bg-[color:var(--lp-cobalt)] opacity-70" />
          {it.strong && <b className="mr-1.5 font-bold tabular-nums text-[color:var(--lp-white)]">{it.strong}</b>}
          {it.text}
        </span>
      ))}
    </div>
  )

  return (
    <div ref={rootRef} className="border-y border-[color:var(--lp-border-soft)] bg-[color:var(--lp-deep)] py-5">
      <div className="lp-marquee">{row('a')}{row('b')}</div>
    </div>
  )
}
