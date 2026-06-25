'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export function SyncStripeButton() {
  const [estado, setEstado] = useState<'idle' | 'carregando' | 'ok' | 'erro'>('idle')
  const [resultado, setResultado] = useState<string | null>(null)

  async function handleSync() {
    setEstado('carregando')
    setResultado(null)
    try {
      const res = await fetch('/api/superadmin/sync-stripe', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setEstado('ok')
        setResultado(`${json.atualizadas} empresa(s) sincronizada(s)${json.erros?.length ? ` · ${json.erros.length} erro(s)` : ''}`)
      } else {
        setEstado('erro')
        setResultado(json.error ?? 'Erro desconhecido')
      }
    } catch {
      setEstado('erro')
      setResultado('Falha na requisição')
    }
    setTimeout(() => { setEstado('idle'); setResultado(null) }, 5000)
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={estado === 'carregando'}
        className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#7C3AED]/40 text-[#7C3AED] hover:bg-[#7C3AED]/10 disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={13} className={estado === 'carregando' ? 'animate-spin' : ''} />
        Sincronizar Stripe
      </button>
      {resultado && (
        <span className={`text-xs ${estado === 'erro' ? 'text-red-400' : 'text-green-400'}`}>
          {resultado}
        </span>
      )}
    </div>
  )
}
