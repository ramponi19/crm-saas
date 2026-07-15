import { useId } from 'react'
import { cn } from '@/lib/utils'

export interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  /** Render-prop: recebe os ids p/ ligar ao controle (aria). */
  children: (ids: { controlId: string; describedBy: string | undefined }) => React.ReactNode
}

/**
 * Envoltório padrão de campo (label + controle + hint/erro), compartilhado
 * por Input/Select/Textarea. Cuida da acessibilidade (for/id, aria-describedby).
 */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const controlId = useId()
  const msgId = useId()
  const describedBy = error || hint ? msgId : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={controlId} className="text-[12px] font-medium text-ink-2">
          {label}
          {required && <span className="text-bad"> *</span>}
        </label>
      )}
      {children({ controlId, describedBy })}
      {(error || hint) && (
        <p id={msgId} className={cn('text-[11px]', error ? 'text-bad' : 'text-ink-3')}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

/** Classe base compartilhada dos controles de formulário (input/select/textarea). */
export function controlClass(hasError: boolean) {
  return cn(
    // 16px no mobile evita o zoom automático do Safari iOS ao focar; 13px no desktop.
    'w-full rounded-control bg-card text-base sm:text-[13px] text-ink placeholder:text-ink-3',
    'border transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent',
    'disabled:opacity-50 disabled:bg-bg',
    hasError ? 'border-bad focus:ring-bad/30 focus:border-bad' : 'border-line',
  )
}
