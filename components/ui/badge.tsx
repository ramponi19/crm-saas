import { cn } from '@/lib/utils'

type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'

const TONES: Record<Tone, { bg: string; text: string; dot: string }> = {
  neutro: { bg: 'bg-ink/[0.05]', text: 'text-ink-2', dot: 'bg-ink-3' },
  acc: { bg: 'bg-accent-soft', text: 'text-accent', dot: 'bg-accent' },
  ok: { bg: 'bg-ok-soft', text: 'text-ok', dot: 'bg-ok' },
  warn: { bg: 'bg-warn-soft', text: 'text-warn', dot: 'bg-warn' },
  bad: { bg: 'bg-bad-soft', text: 'text-bad', dot: 'bg-bad' },
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  /** Ponto quadrado 6px à esquerda (padrão de status Precisão). */
  dot?: boolean
}

/** Chip de status Precisão: radius 6px, 10px, peso 600. */
export function Badge({ tone = 'neutro', dot = false, className, children, ...props }: BadgeProps) {
  const t = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[6px] px-[9px] py-[3px] text-[10px] font-semibold tracking-[0.02em] whitespace-nowrap',
        t.bg,
        t.text,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-[2px]', t.dot)} />}
      {children}
    </span>
  )
}
