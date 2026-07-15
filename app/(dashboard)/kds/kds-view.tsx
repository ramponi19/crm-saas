'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Topbar } from '@/components/layout/topbar'
import { notify } from '@/components/ui'
import { Clock, Check, X } from 'lucide-react'

export interface ItemPedido { produto_id?: number; nome: string; preco?: number; qtd: number }
export interface Pedido {
  id: number
  mesa: string | null
  cliente_nome: string | null
  itens: ItemPedido[]
  total: number
  status: string
  observacoes: string | null
  created_at: string | null
}

const COLS = [
  { id: 'recebido', label: 'Recebido', tone: 'border-accent/40' },
  { id: 'preparando', label: 'Preparando', tone: 'border-warn/40' },
  { id: 'pronto', label: 'Pronto', tone: 'border-ok/40' },
]
const PROX: Record<string, string> = { recebido: 'preparando', preparando: 'pronto', pronto: 'entregue' }
const ACAO: Record<string, string> = { recebido: 'Iniciar preparo', preparando: 'Marcar pronto', pronto: 'Entregar' }

function minAtras(iso: string | null): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'agora' : m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export function KdsView({ empresaId, inicial }: { empresaId: number; inicial: Pedido[] }) {
  const supabase = createClient()
  const [pedidos, setPedidos] = useState<Pedido[]>(inicial)
  const [, setTick] = useState(0)

  // Atualiza os "min atrás" a cada 30s.
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t) }, [])

  useEffect(() => {
    const ch = supabase.channel(`kds_${empresaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${empresaId}` },
        (payload: RealtimePostgresChangesPayload<Pedido & { itens: unknown }>) => {
          const nova = payload.new as Pedido | undefined
          const velha = payload.old as { id: number } | undefined
          if (payload.eventType === 'DELETE' && velha) { setPedidos((p) => p.filter((x) => x.id !== velha.id)); return }
          if (!nova) return
          const ativo = ['recebido', 'preparando', 'pronto'].includes(nova.status)
          const norm: Pedido = { ...nova, total: Number(nova.total) || 0, itens: Array.isArray(nova.itens) ? (nova.itens as ItemPedido[]) : [] }
          setPedidos((p) => {
            const sem = p.filter((x) => x.id !== norm.id)
            return ativo ? [...sem, norm].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')) : sem
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function avancar(p: Pedido) {
    const prox = PROX[p.status]
    if (!prox) return
    setPedidos((prev) => prox === 'entregue' ? prev.filter((x) => x.id !== p.id) : prev.map((x) => x.id === p.id ? { ...x, status: prox } : x))
    const { error } = await supabase.from('pedidos').update({ status: prox }).eq('id', p.id)
    if (error) notify.bad('Erro ao atualizar pedido')
  }

  async function cancelar(p: Pedido) {
    setPedidos((prev) => prev.filter((x) => x.id !== p.id))
    await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', p.id)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Cozinha (KDS)" />
      <div className="flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden p-4 scrollbar-none lg:snap-none lg:overflow-hidden">
        {COLS.map((col) => {
          const cards = pedidos.filter((p) => p.status === col.id)
          return (
            <div key={col.id} className="flex w-[80vw] min-w-[240px] flex-none snap-start flex-col lg:w-auto lg:min-w-0 lg:flex-1">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[13px] font-semibold text-ink">{col.label}</span>
                <span className="num rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] text-ink-2">{cards.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin">
                {cards.length === 0 ? (
                  <div className="rounded-card border border-dashed border-line py-10 text-center text-[12px] text-ink-3">Vazio</div>
                ) : cards.map((p) => (
                  <div key={p.id} className={`rounded-card border-2 bg-card p-3 ${col.tone}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-ink">{p.mesa ? `Mesa ${p.mesa}` : (p.cliente_nome || `#${p.id}`)}</span>
                      <span className="flex items-center gap-1 text-[11px] text-ink-3"><Clock size={11} strokeWidth={1.9} />{minAtras(p.created_at)}</span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {p.itens.map((it, i) => (
                        <div key={i} className="flex justify-between text-[12.5px] text-ink-2">
                          <span><span className="num font-semibold text-ink">{it.qtd}×</span> {it.nome}</span>
                        </div>
                      ))}
                    </div>
                    {p.observacoes && <div className="mt-1.5 rounded-control bg-warn-soft px-2 py-1 text-[11px] text-warn">{p.observacoes}</div>}
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => avancar(p)} className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-ink px-3 py-2 text-[12.5px] font-semibold text-white hover:opacity-90">
                        <Check size={14} strokeWidth={2} /> {ACAO[p.status]}
                      </button>
                      <button onClick={() => cancelar(p)} className="grid size-8 place-items-center rounded-control border border-line text-ink-3 hover:text-bad" aria-label="Cancelar"><X size={15} strokeWidth={1.8} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
