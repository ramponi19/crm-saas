'use client'

import { Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-control bg-ink px-4 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink/90"
    >
      <Printer size={15} strokeWidth={1.7} /> Baixar / imprimir PDF
    </button>
  )
}
