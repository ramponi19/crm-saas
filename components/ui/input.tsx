import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Field, controlClass } from './field'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  /** Ícone à esquerda dentro do campo (lucide). */
  icon?: React.ReactNode
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, required, className, wrapperClassName, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ controlId, describedBy }) => (
        <div className="relative flex items-center">
          {icon && (
            <span className="pointer-events-none absolute left-3 text-ink-3">{icon}</span>
          )}
          <input
            ref={ref}
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            required={required}
            className={cn(controlClass(!!error), 'h-9 px-3', icon ? 'pl-9' : '', className)}
            {...props}
          />
        </div>
      )}
    </Field>
  )
})
