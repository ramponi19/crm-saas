'use client'

import { Copy, type LucideIcon } from 'lucide-react'
import { Card, IconButton } from '@/components/ui'

/** Um bloco da tela de Integrações (canais do core, e o que um módulo ligado acrescenta). */
export function IntegracaoCard({ icon: Icon, titulo, desc, children }: { icon: LucideIcon; titulo: string; desc: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent"><Icon size={20} strokeWidth={1.7} /></div>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{titulo}</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-2">{desc}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

/** Um endereço para copiar, com o rótulo à esquerda. */
export function UrlLinha({ label, url, onCopy }: { label: string; url: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-control bg-ink/[0.04] px-3 py-2">
      <span className="shrink-0 text-[11px] font-medium text-ink-3">{label}</span>
      <code className="num flex-1 truncate text-[12px] text-ink-2">{url}</code>
      <IconButton aria-label="Copiar" size="sm" onClick={onCopy}><Copy size={14} strokeWidth={1.7} /></IconButton>
    </div>
  )
}
