'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

/**
 * Efeito de atração magnética: o elemento é puxado suavemente na direção
 * do ponteiro e volta ao lugar ao sair.
 *
 * O centro do elemento é capturado no `mouseenter` (posição em repouso) e
 * reutilizado durante o `mousemove` — assim, quando o botão se desloca em
 * direção ao cursor, a referência NÃO muda e não há tremor (feedback loop).
 *
 * - `strength`  quanto o elemento acompanha o cursor (0–1)
 * - `innerRef`  filho opcional que se move um pouco mais (parallax de conteúdo)
 *
 * Desativado com reduced-motion.
 */
export function useMagnetic<T extends HTMLElement = HTMLElement>(strength = 0.3) {
  const ref = useRef<T>(null)
  const innerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // baseline explícito para não herdar transform de outras animações
    gsap.set(el, { x: 0, y: 0 })
    const inner0 = innerRef.current
    if (inner0) gsap.set(inner0, { x: 0, y: 0 })

    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' })
    const inner = innerRef.current
    const ixTo = inner ? gsap.quickTo(inner, 'x', { duration: 0.6, ease: 'power3.out' }) : null
    const iyTo = inner ? gsap.quickTo(inner, 'y', { duration: 0.6, ease: 'power3.out' }) : null

    let cx = 0, cy = 0
    const capture = () => {
      const r = el.getBoundingClientRect()
      cx = r.left + r.width / 2
      cy = r.top + r.height / 2
    }
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      xTo(dx * strength)
      yTo(dy * strength)
      ixTo?.(dx * strength * 0.4)
      iyTo?.(dy * strength * 0.4)
    }
    const onLeave = () => {
      xTo(0); yTo(0)
      ixTo?.(0); iyTo?.(0)
    }

    el.addEventListener('mouseenter', capture)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mouseenter', capture)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [strength])

  return { ref, innerRef }
}
