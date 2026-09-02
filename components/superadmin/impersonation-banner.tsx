'use client'

import { useState } from 'react'
import { Eye, X } from 'lucide-react'

// Roxo = modo plataforma (superadmin). Barra chapada e discreta (sem gradiente).
export function ImpersonationBanner({ empresaNome }: { empresaNome: string }) {
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    setSaindo(true)
    try {
      await fetch('/api/superadmin/empresas/0/impersonar', { method: 'DELETE' })
      // Navegação hard: garante que o servidor re-renderize sem a impersonação,
      // sem risco de servir o /dashboard em cache da empresa anterior.
      // Sair da personificação troca o tenant inteiro: recarga limpa tudo.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/superadmin/empresas'
    } catch {
      setSaindo(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-2.5 border-b border-[#6D28D9]/20 bg-[#6D28D9]/[0.08] px-4 py-2 text-[12.5px] font-medium text-[#6D28D9]">
      <Eye size={14} strokeWidth={1.7} className="shrink-0" />
      <span>Visualizando como <strong className="font-semibold">{empresaNome}</strong> — modo plataforma</span>
      <button
        onClick={sair}
        disabled={saindo}
        className="ml-1 inline-flex items-center gap-1 rounded-control bg-[#6D28D9]/10 px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:bg-[#6D28D9]/20 disabled:opacity-60"
      >
        <X size={12} strokeWidth={2} />
        {saindo ? 'Saindo…' : 'Sair'}
      </button>
    </div>
  )
}
