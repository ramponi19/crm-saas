import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  // Botão primário Precisão: fundo ink, texto branco (nunca cobalto).
  primary: 'bg-ink text-white hover:bg-ink/90 active:bg-ink/80',
  outline: 'border border-line bg-card text-ink hover:bg-bg active:bg-line-soft',
  ghost: 'text-ink hover:bg-ink/[0.05] active:bg-ink/[0.08]',
  danger: 'bg-bad text-white hover:bg-bad/90 active:bg-bad/80',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5',
  md: 'h-9 px-4 text-[13px] gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Ícone à esquerda do label (lucide, já com stroke 1.7). */
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium tracking-[-0.01em]',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={size === 'lg' ? 18 : 15} strokeWidth={1.7} /> : icon}
      {children}
    </button>
  )
})
