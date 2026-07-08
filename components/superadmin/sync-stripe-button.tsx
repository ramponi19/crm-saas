'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'

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
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        loading={estado === 'carregando'}
        icon={<RefreshCw size={14} strokeWidth={1.7} />}
      >
        Sincronizar Stripe
      </Button>
      {resultado && (
        <span className={`text-[12px] font-medium ${estado === 'erro' ? 'text-bad' : 'text-ok'}`}>
          {resultado}
        </span>
      )}
    </div>
  )
}
