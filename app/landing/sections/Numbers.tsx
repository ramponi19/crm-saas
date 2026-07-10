'use client'

/**
 * Numbers — prova social em contadores gigantes que sobem ao entrar na
 * viewport (uma vez). Reduced-motion: valores finais estáticos.
 */

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { STATS } from '../data'

export default function Numbers() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      gsap.from('[data-stat]', {
        y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 78%' },
      })
      root.querySelectorAll<HTMLElement>('[data-count]').forEach((el, i) => {
        const stat = STATS[i]
        const obj = { v: 0 }
        gsap.to(obj, {
          v: stat.value, duration: 1.6, delay: i * 0.1, ease: 'power2.out',
          scrollTrigger: { trigger: root, start: 'top 78%' },
          onUpdate: () => { el.textContent = stat.format(obj.v) },
        })
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={rootRef} className="border-t border-[color:var(--lp-border-soft)] bg-[color:var(--lp-deep)] py-24 text-[color:var(--lp-white)]">
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-x-6 gap-y-12 px-5 sm:px-6 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} data-stat>
            <div data-count className="text-[clamp(38px,5vw,60px)] font-extrabold tabular-nums leading-none tracking-[-0.045em]">
              {s.format(s.value)}
            </div>
            <div className="mt-2.5 text-[14px] font-semibold">{s.label}</div>
            <div className="mt-0.5 text-[12.5px] text-[color:var(--lp-faint)]">{s.sub}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
