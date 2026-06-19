'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Anima um número de um valor anterior até o alvo.
 * Usa requestAnimationFrame com easing suave (cubic-bezier-like).
 */
export function useAnimatedNumber(target: number, duration = 600): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    const to = target
    if (from === to) {
      setValue(to)
      return
    }
    const start = performance.now()

    // easeOutCubic — desacelera no final, sensação premium
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)

    function tick(now: number) {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      const eased = ease(t)
      setValue(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setValue(to)
        fromRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = target
    }
  }, [target, duration])

  return value
}
