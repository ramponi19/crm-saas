'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, X } from 'lucide-react'

export function ImpersonationBanner({ empresaNome }: { empresaNome: string }) {
  const router = useRouter()
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    setSaindo(true)
    try {
      // O id no path é ignorado pelo handler DELETE; usamos 0 como placeholder.
      await fetch('/api/superadmin/empresas/0/impersonar', { method: 'DELETE' })
      router.push('/superadmin/empresas')
      router.refresh()
    } finally {
      setSaindo(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2.5 text-white text-[13px] font-semibold"
      style={{ background: 'linear-gradient(90deg, #7C3AED, #6D28D9)' }}
    >
      <Eye size={16} className="shrink-0" />
      <span>
        Você está visualizando como <strong>{empresaNome}</strong> — modo impersonação ativo
      </span>
      <button
        onClick={sair}
        disabled={saindo}
        className="ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-[12px] disabled:opacity-60"
      >
        <X size={13} />
        {saindo ? 'Saindo...' : 'Sair'}
      </button>
    </div>
  )
}
