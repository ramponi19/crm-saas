'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useLockScroll, useEscape, useFocusTrap } from './overlay'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * Bottom-sheet (mobile-first): sobe de baixo, cantos superiores arredondados,
 * alça de arraste. Em telas grandes segue como sheet ancorado embaixo/centro.
 */
export function Drawer({ open, onClose, title, footer, children }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null)
  useLockScroll(open)
  useEscape(open, onClose)
  useFocusTrap(ref, open)

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/30 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[92vh] w-full flex-col rounded-t-modal border border-line bg-card shadow-[0_-16px_50px_-20px_rgba(21,24,28,0.35)]',
          'sm:max-w-[520px] sm:rounded-modal',
          'animate-[uiSheetUp_0.22s_cubic-bezier(0.16,1,0.3,1)]',
        )}
      >
        <div className="flex flex-col items-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-ink/[0.12]" />
        </div>
        {title != null && (
          <div className="border-b border-line-soft px-5 py-3.5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line-soft px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
