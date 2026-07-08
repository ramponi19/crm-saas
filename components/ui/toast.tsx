'use client'

import { toast as sonner, Toaster } from 'sonner'
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'ok' | 'bad' | 'warn' | 'info'

const TONE: Record<Tone, { icon: typeof Info; color: string }> = {
  ok: { icon: CheckCircle2, color: 'text-ok' },
  bad: { icon: XCircle, color: 'text-bad' },
  warn: { icon: AlertTriangle, color: 'text-warn' },
  info: { icon: Info, color: 'text-accent' },
}

function card(tone: Tone, title: React.ReactNode, description?: React.ReactNode) {
  const { icon: Icon, color } = TONE[tone]
  return (
    <div className="flex w-[340px] max-w-[88vw] items-start gap-3 rounded-card border border-line bg-card px-4 py-3 shadow-[0_16px_40px_-16px_rgba(21,24,28,0.28)]">
      <Icon size={18} strokeWidth={1.7} className={cn('mt-0.5 flex-shrink-0', color)} />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        {description && <div className="mt-0.5 text-[12px] text-ink-2">{description}</div>}
      </div>
    </div>
  )
}

/** Toasts Precisão (adapter sobre sonner). Requer <PrecisaoToaster /> no layout. */
export const notify = {
  ok: (title: React.ReactNode, description?: React.ReactNode) =>
    sonner.custom(() => card('ok', title, description)),
  bad: (title: React.ReactNode, description?: React.ReactNode) =>
    sonner.custom(() => card('bad', title, description)),
  warn: (title: React.ReactNode, description?: React.ReactNode) =>
    sonner.custom(() => card('warn', title, description)),
  info: (title: React.ReactNode, description?: React.ReactNode) =>
    sonner.custom(() => card('info', title, description)),
  /** Acesso direto ao sonner (promise, dismiss, etc.). */
  raw: sonner,
}

/** Toaster estilizado — trocar o <Toaster> do layout por este ao fim da migração. */
export function PrecisaoToaster() {
  return <Toaster position="top-right" gap={10} toastOptions={{ unstyled: true }} />
}
