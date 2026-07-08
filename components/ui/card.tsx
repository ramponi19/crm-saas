import { cn } from '@/lib/utils'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Título opcional no cabeçalho do card. */
  title?: React.ReactNode
  /** Ações no canto direito do cabeçalho (botões, menu). */
  actions?: React.ReactNode
  /** Remove o padding interno do corpo (p/ tabelas full-bleed). */
  flush?: boolean
}

/**
 * Container base Precisão: borda line, sem sombra (a sombra é reservada a
 * modal/dropdown). Radius de card. Cabeçalho opcional com título + ações.
 */
export function Card({ title, actions, flush = false, className, children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-card border border-line bg-card', className)} {...props}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
          {title && (
            <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
          )}
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn(flush ? '' : 'p-4')}>{children}</div>
    </div>
  )
}
