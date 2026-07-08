import { cn } from '@/lib/utils'

type DeltaTone = 'ok' | 'bad' | 'warn' | 'neutral'

const DELTA: Record<DeltaTone, string> = {
  ok: 'text-ok',
  bad: 'text-bad',
  warn: 'text-warn',
  neutral: 'text-ink-3 font-medium',
}

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: React.ReactNode
  /** Texto do delta (ex.: "+12,4% vs ontem"). */
  delta?: React.ReactNode
  deltaTone?: DeltaTone
  /** Sparkline CSS opcional: valores 0..1 (o último é destacado em cobalto). */
  spark?: number[]
  /** Remove a borda/padding próprios (p/ agrupar num grid com bordas internas). */
  bare?: boolean
}

export function StatCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  spark,
  bare = false,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn(bare ? 'p-[16px_18px]' : 'rounded-card border border-line bg-card p-[16px_18px]', className)}
      {...props}
    >
      <div className="text-[11px] font-medium text-ink-3">{label}</div>
      <div className="num mt-[5px] mb-[2px] text-[26px] font-bold leading-none tracking-[-0.035em] text-ink">
        {value}
      </div>
      {delta && <div className={cn('text-[11.5px] font-semibold', DELTA[deltaTone])}>{delta}</div>}
      {spark && spark.length > 0 && (
        <div className="mt-[10px] flex h-[22px] items-end gap-[3px]">
          {spark.map((h, i) => (
            <span
              key={i}
              className={cn('flex-1 rounded-[1.5px]', i === spark.length - 1 ? 'bg-accent' : 'bg-ink/[0.07]')}
              style={{ height: `${Math.max(4, Math.min(100, h * 100))}%` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
