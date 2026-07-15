'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLockScroll, useEscape, useFocusTrap } from './overlay'

type Size = 'sm' | 'md' | 'lg'
const SIZES: Record<Size, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[760px]',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  /** Rodapé (normalmente botões). Alinhado à direita por padrão. */
  footer?: React.ReactNode
  size?: Size
  /** Impede fechar ao clicar no overlay (ex.: formulário sujo). */
  disableOverlayClose?: boolean
  children: React.ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  footer,
  size = 'md',
  disableOverlayClose = false,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useLockScroll(open)
  useEscape(open, onClose)
  useFocusTrap(ref, open)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/30 sm:items-start sm:px-4 sm:py-[8vh]"
      onMouseDown={(e) => {
        if (!disableOverlayClose && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[92vh] w-full flex-col rounded-t-modal border border-line bg-card shadow-[0_30px_70px_-20px_rgba(21,24,28,0.4)]',
          'animate-[uiSheetUp_0.22s_cubic-bezier(0.16,1,0.3,1)] sm:max-h-[86vh] sm:rounded-modal sm:animate-[uiPop_0.16s_cubic-bezier(0.16,1,0.3,1)]',
          SIZES[size],
        )}
      >
        {title != null && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
            <button
              aria-label="Fechar"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-control text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink"
            >
              <X size={17} strokeWidth={1.7} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
