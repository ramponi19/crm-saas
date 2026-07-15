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

// ⚠️ Placeholders — trocar por depoimentos reais (nome/foto) quando houver.
const MAIS = [
  { ini: 'AC', nome: 'Ana Carolina', papel: 'Imobiliária', txt: 'Os lembretes de visita pararam de furar. Cada corretor abre o dia sabendo exatamente o que fazer.' },
  { ini: 'PM', nome: 'Dr. Paulo', papel: 'Clínica', txt: 'O agendamento online 24h encheu minha agenda sem eu precisar contratar recepção.' },
  { ini: 'RS', nome: 'Rafael', papel: 'Loja de veículos', txt: 'Todo lead do Instagram vira card com dono e prazo. Nada mais se perde no meio do caminho.' },
]

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
          <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-[15px] font-bold text-white">M</span>
          <div>
            <div className="text-[15px] font-bold">Matheus · JM Store</div>
            <div className="text-[13px] text-ink-3">Varejo de eletrônicos · cliente desde 2025</div>
          </div>
        </figcaption>

        {/* mais vozes — por segmento */}
        <div data-stagger className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MAIS.map((m) => (
            <div key={m.nome} className="rounded-card border border-line bg-card p-5">
              <p className="text-[13.5px] leading-relaxed text-ink-2">“{m.txt}”</p>
              <div className="mt-4 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{m.ini}</span>
                <div>
                  <div className="text-[12.5px] font-bold text-ink">{m.nome}</div>
                  <div className="text-[11.5px] text-ink-3">{m.papel}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
