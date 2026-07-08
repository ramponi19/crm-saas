'use client'

import { cn } from '@/lib/utils'

export interface TabItem {
  value: string
  label: React.ReactNode
  badge?: React.ReactNode
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/** Tabs com sublinhado cobalto no item ativo (estilo Linear/Stripe). */
export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-line', className)} role="tablist">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(it.value)}
            className={cn(
              'relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-2 hover:text-ink',
            )}
          >
            {it.label}
            {it.badge != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] font-semibold',
                  active ? 'bg-accent-soft text-accent' : 'bg-ink/[0.05] text-ink-3',
                )}
              >
                {it.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
