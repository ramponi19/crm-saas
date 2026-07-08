import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'ghost' | 'outline' | 'primary' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-ink-2 hover:bg-ink/[0.05] hover:text-ink active:bg-ink/[0.08]',
  outline: 'border border-line bg-card text-ink hover:bg-bg',
  primary: 'bg-ink text-white hover:bg-ink/90',
  danger: 'text-bad hover:bg-bad-soft',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: acessibilidade — botão só de ícone precisa de rótulo. */
  'aria-label': string
  variant?: Variant
  size?: Size
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-control transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
