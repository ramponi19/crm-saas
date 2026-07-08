import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'

export interface Column<T> {
  key: string
  header: React.ReactNode
  render: (row: T, index: number) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  /** Classe extra na célula (ex.: 'num w-[120px]'). */
  className?: string
  /** Oculta a coluna abaixo de md (mobile). */
  hideOnMobile?: boolean
}

export interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  onRowClick?: (row: T) => void
  /** Estado vazio embutido (título + ícone + ação). */
  empty?: React.ReactNode
  className?: string
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' }

/** Tabela densa Precisão: cabeçalho em caixa-alta discreta, linhas com hover. */
export function Table<T>({ columns, rows, rowKey, onRowClick, empty, className }: TableProps<T>) {
  if (rows.length === 0) {
    return <div className={className}>{empty ?? <EmptyState title="Nada por aqui ainda" />}</div>
  }
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-3',
                  ALIGN[c.align ?? 'left'],
                  c.hideOnMobile && 'hidden md:table-cell',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-line-soft transition-colors last:border-b-0',
                onRowClick && 'cursor-pointer hover:bg-raised',
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 py-2.5 text-ink',
                    ALIGN[c.align ?? 'left'],
                    c.hideOnMobile && 'hidden md:table-cell',
                    c.className,
                  )}
                >
                  {c.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
