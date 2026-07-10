'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Reveal padrão das seções: elementos [data-rise] sobem ao entrar na
 * viewport; grupos [data-stagger] animam os filhos em cascata.
 * Reduced-motion: tudo permanece estático (nunca escondido).
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)

    // IMPORTANTE: escopar as buscas ao root da seção — toArray('[selector]')
    // seria global e, com várias seções usando o hook, criaria tweens from()
    // duplicados no mesmo elemento (o 2º captura o estado escondido como
    // destino e o elemento nunca aparece).
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-rise]')).forEach((el) => {
        gsap.from(el, {
          y: 36, opacity: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        })
      })
      gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-stagger]')).forEach((grp) => {
        gsap.from(Array.from(grp.children), {
          y: 36, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out',
          scrollTrigger: { trigger: grp, start: 'top 82%' },
        })
      })
    }, root)

    return () => ctx.revert()
  }, [])

  return ref
}
