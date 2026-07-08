import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Field, controlClass } from './field'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, wrapperClassName, rows = 4, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ controlId, describedBy }) => (
        <textarea
          ref={ref}
          id={controlId}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          required={required}
          className={cn(controlClass(!!error), 'px-3 py-2 resize-y min-h-[80px] leading-relaxed', className)}
          {...props}
        />
      )}
    </Field>
  )
})
