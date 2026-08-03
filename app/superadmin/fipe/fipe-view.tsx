'use client'

import { useState } from 'react'
import { Car, RefreshCw, Info } from 'lucide-react'
import { Card, Button, Badge, notify } from '@/components/ui'

export function FipeView({ mes, atualizadoEm, totalCache }: { mes: string | null; atualizadoEm: string | null; totalCache: number }) {
  const [ref, setRef] = useState({ mes, atualizadoEm })
  const [total] = useState(totalCache)
  const [sincronizando, setSincronizando] = useState(false)

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'nunca sincronizado')

  async function atualizar() {
    setSincronizando(true)
    try {
      const res = await fetch('/api/superadmin/fipe', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error)
      setRef({ mes: j.mes ?? null, atualizadoEm: new Date().toISOString() })
      notify.ok('FIPE atualizada', j.mes ? `Mês de referência: ${j.mes}` : undefined)
    } catch (e) {
      notify.bad('Falha ao atualizar', e instanceof Error ? e.message : undefined)
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[760px] space-y-4">
        <div className="flex items-center gap-2.5">
          <Car size={20} strokeWidth={1.7} className="text-ink" />
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Tabela FIPE</h1>
        </div>

        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[160px] flex-1">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">Mês de referência</div>
              <div className="mt-1 text-[17px] font-semibold text-ink">{ref.mes ?? '—'}</div>
            </div>
            <div className="min-w-[160px] flex-1">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">Última atualização</div>
              <div className="num mt-1 text-[13.5px] text-ink-2">{fmt(ref.atualizadoEm)}</div>
            </div>
            <Badge tone="neutro" className="num">{total} em cache</Badge>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-line-soft pt-4">
            <Button onClick={atualizar} loading={sincronizando} icon={<RefreshCw size={15} strokeWidth={1.7} />}>
              Atualizar agora
            </Button>
            <span className="text-[12.5px] text-ink-3">A atualização também roda sozinha todo dia.</span>
          </div>
        </Card>

        <Card>
          <div className="flex gap-3">
            <Info size={18} strokeWidth={1.7} className="mt-0.5 flex-none text-accent" />
            <div className="text-[13px] leading-relaxed text-ink-2">
              <strong className="text-ink">Quando atualizar manualmente:</strong> a FIPE costuma publicar o novo mês
              <strong className="text-ink"> entre o dia 1 e o dia 5</strong>. Se por algum motivo a atualização automática
              não pegar o mês novo nesse período, clique em <strong className="text-ink">Atualizar agora</strong>. Os valores
              consultados ficam guardados no nosso banco — se a fonte da FIPE cair, o sistema segue com o último valor conhecido.
            </div>
          </div>
        </Card>
      </div>
    </main>
  )
}
