import { useEffect, useRef, useState } from 'react'

/**
 * Anima um número de um valor anterior até o alvo.
 * Versão segura: cancela corretamente animações sobrepostas.
 */
export function useAnimatedNumber(target: number, duration = 500): number {
  const [value, setValue] = useState(target)
  const stateRef = useRef({ from: target, raf: 0, start: 0 })

  useEffect(() => {
    const state = stateRef.current
    // Cancela animação anterior se ainda rodando
    if (state.raf) cancelAnimationFrame(state.raf)

    const from = value // começa do valor atual visível
    const to = target
    if (from === to) return

    state.from = from
    state.start = performance.now()

    const ease = (t: number) => t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2 // easeInOutCubic

    const tick = (now: number) => {
      const t = Math.min((now - state.start) / duration, 1)
      const eased = ease(t)
      const current = state.from + (to - state.from) * eased
      setValue(current)
      if (t < 1) {
        state.raf = requestAnimationFrame(tick)
      } else {
        setValue(to)
        state.raf = 0
      }
    }

    state.raf = requestAnimationFrame(tick)
    return () => {
      if (state.raf) cancelAnimationFrame(state.raf)
      state.raf = 0
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}
