import { cn } from '@/lib/utils'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ícone lucide (renderizado dentro de um círculo suave). */
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  /** Ação principal (normalmente um <Button>). */
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
      {...props}
    >
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-ink/[0.04] text-ink-3">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
