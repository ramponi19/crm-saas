'use client'

/**
 * Testimonial — depoimento em tipografia grande com highlight
 * palavra-a-palavra scrubado no scroll (as palavras "acendem" conforme
 * o leitor desce). Reduced-motion: texto pleno, estático.
 */

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const QUOTE =
  'Saímos de três planilhas e um caderno para um sistema só. Em dois meses o tempo de resposta no WhatsApp caiu para menos de 2 minutos e paramos de perder venda por esquecimento.'

export default function Testimonial() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-word]',
        { opacity: 0.16 },
        {
          opacity: 1, stagger: 0.035, ease: 'none',
          scrollTrigger: { trigger: root, start: 'top 76%', end: 'top 22%', scrub: 0.4 },
        },
      )
      gsap.from('[data-author]', {
        y: 20, opacity: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: '[data-author]', start: 'top 88%' },
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={rootRef} className="bg-bg py-28 text-ink">
      <div className="mx-auto max-w-[880px] px-5 sm:px-6">
        <blockquote className="text-[clamp(24px,3.4vw,38px)] font-bold leading-[1.25] tracking-[-0.03em]">
          {QUOTE.split(' ').map((w, i) => (
            <span key={i} data-word>{w}{' '}</span>
          ))}
        </blockquote>
        <figcaption data-author className="mt-9 flex items-center gap-3.5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-[15px] font-bold text-white">J</span>
          <div>
            <div className="text-[15px] font-bold">Matheus · JM Store</div>
            <div className="text-[13px] text-ink-3">Varejo de eletrônicos · cliente desde 2025</div>
          </div>
        </figcaption>
      </div>
    </section>
  )
}
