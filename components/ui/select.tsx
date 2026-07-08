import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Field, controlClass } from './field'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, wrapperClassName, children, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ controlId, describedBy }) => (
        <div className="relative">
          <select
            ref={ref}
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            required={required}
            className={cn(controlClass(!!error), 'h-9 pl-3 pr-9 appearance-none cursor-pointer', className)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={16}
            strokeWidth={1.7}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
        </div>
      )}
    </Field>
  )
})
