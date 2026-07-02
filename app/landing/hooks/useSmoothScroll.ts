'use client'

import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

/**
 * Inicializa o Lenis (smooth scroll) e o integra ao ticker do GSAP,
 * garantindo que ScrollTrigger e a rolagem compartilhem o mesmo clock.
 * Respeita `prefers-reduced-motion`: se o usuário pediu menos animação,
 * a rolagem nativa do navegador é mantida.
 *
 * Retorna a instância do Lenis (ou null) caso alguma fase precise
 * de `lenis.scrollTo()` para âncoras suaves.
 */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.registerPlugin(ScrollTrigger)

    const lenis = new Lenis({
      duration: 1.15,
      // easing exponencial — desaceleração cinematográfica
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    })

    // Sincroniza ScrollTrigger a cada frame de rolagem
    lenis.on('scroll', ScrollTrigger.update)

    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    // Âncoras internas (#planos etc.) rolam com o Lenis
    const onAnchorClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest('a[href^="#"]')
      if (!target) return
      const id = target.getAttribute('href')
      if (!id || id === '#') return
      const el = document.querySelector(id)
      if (!el) return
      e.preventDefault()
      lenis.scrollTo(el as HTMLElement, { offset: -80, duration: 1.4 })
    }
    document.addEventListener('click', onAnchorClick)

    return () => {
      document.removeEventListener('click', onAnchorClick)
      gsap.ticker.remove(raf)
      lenis.destroy()
    }
  }, [enabled])
}
