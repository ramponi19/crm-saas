'use client'

import { useAnimatedNumber } from '@/lib/use-animated-number'
import { formatCurrency } from '@/lib/utils'

export function AnimatedCurrency({ value, className }: { value: number; className?: string }) {
  const animated = useAnimatedNumber(value)
  return <span className={className}>{formatCurrency(animated)}</span>
}

export function AnimatedInt({ value, className }: { value: number; className?: string }) {
  const animated = useAnimatedNumber(value)
  return <span className={className}>{Math.round(animated).toLocaleString('pt-BR')}</span>
}
