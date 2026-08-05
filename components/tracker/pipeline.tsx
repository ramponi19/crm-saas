'use client'

import { useMemo, useState } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  DragOverlay, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', bg: '#eef1f5' }

export interface Etapa { slug: string; label: string; cor: string | null; ordem: number; tipo: string | null }
export interface CardLead {
  id: number; nome: string; telefone: string | null; foto_url: string | null
  valor: number | null; etapa: string; produto: string | null; origem: string | null
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const iniciais = (n: string) => n.trim().slice(0, 2).toUpperCase()

export function Pipeline({ funilNome, funilId, etapas, leadsIniciais }: {
  funilNome: string; funilId: number | null; etapas: Etapa[]; leadsIniciais: CardLead[]
}) {
  const [leads, setLeads] = useState<CardLead[]>(leadsIniciais)
  const [arrastando, setArrastando] = useState<CardLead | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Slugs válidos; leads em etapa inexistente caem na 1ª coluna.
  const slugs = useMemo(() => new Set(etapas.map((e) => e.slug)), [etapas])
  const primeira = etapas[0]?.slug

  const porEtapa = useMemo(() => {
    const map = new Map<string, CardLead[]>()
    for (const e of etapas) map.set(e.slug, [])
    for (const l of leads) {
      const dest = slugs.has(l.etapa) ? l.etapa : primeira
      if (dest) map.get(dest)!.push(l)
    }
    return map
  }, [leads, etapas, slugs, primeira])

  function onStart(e: DragStartEvent) {
    setArrastando(leads.find((l) => l.id === Number(e.active.id)) ?? null)
  }

  async function onEnd(e: DragEndEvent) {
    setArrastando(null)
    const leadId = Number(e.active.id)
    const destino = e.over?.id ? String(e.over.id) : null
    if (!destino || !slugs.has(destino)) return
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.etapa === destino) return

    const anterior = lead.etapa
    setLeads((ls) => ls.map((l) => l.id === leadId ? { ...l, etapa: destino } : l))
    try {
      const r = await fetch('/api/tracker/crm/mover', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, etapa: destino, funilId }),
      })
      if (!r.ok) throw new Error()
    } catch {
      setLeads((ls) => ls.map((l) => l.id === leadId ? { ...l, etapa: anterior } : l))
    }
  }

  if (etapas.length === 0) {
    return (
      <div className="px-5 py-5 sm:px-7">
        <h1 className="text-[22px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>CRM</h1>
        <div className="mt-6 grid min-h-[220px] place-items-center rounded-[14px] border text-[13px]" style={{ borderColor: C.line, background: C.card, color: C.ink3 }}>
          Nenhum funil configurado nesta empresa.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-7">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>CRM</h1>
          <p className="text-[13px]" style={{ color: C.ink3 }}>Pipeline de vendas{funilNome ? ` · ${funilNome}` : ''}</p>
        </div>
      </header>

      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
        <div className="min-h-0 flex-1 overflow-x-auto px-5 py-4 sm:px-7">
          <div className="flex h-full gap-3">
            {etapas.map((etapa) => {
              const itens = porEtapa.get(etapa.slug) ?? []
              const total = itens.reduce((s, l) => s + (l.valor ?? 0), 0)
              return (
                <Coluna key={etapa.slug} etapa={etapa} count={itens.length} total={total}>
                  {itens.map((l) => <Card key={l.id} lead={l} />)}
                </Coluna>
              )
            })}
          </div>
        </div>
        <DragOverlay>{arrastando ? <CardVisual lead={arrastando} sombra /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}

function Coluna({ etapa, count, total, children }: { etapa: Etapa; count: number; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.slug })
  const cor = etapa.cor || C.teal
  return (
    <div className="flex w-[276px] shrink-0 flex-col rounded-[14px]" style={{ background: isOver ? '#e7efec' : '#f4f6f8', outline: isOver ? `2px dashed ${C.teal}` : 'none' }}>
      <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />
          <span className="text-[13px] font-semibold" style={{ color: C.ink }}>{etapa.label}</span>
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-semibold" style={{ background: '#e2e8ec', color: C.ink2 }}>{count}</span>
        </div>
      </div>
      {total > 0 && <div className="px-3.5 pb-1.5 text-[11px] font-medium" style={{ color: C.ink3 }}>{brl(total)}</div>}
      <div ref={setNodeRef} className="min-h-[80px] flex-1 space-y-2 overflow-y-auto px-2.5 pb-3">{children}</div>
    </div>
  )
}

function Card({ lead }: { lead: CardLead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.4 : 1, touchAction: 'none' }} className="cursor-grab active:cursor-grabbing">
      <CardVisual lead={lead} />
    </div>
  )
}

function CardVisual({ lead, sombra }: { lead: CardLead; sombra?: boolean }) {
  return (
    <div className="rounded-[11px] border bg-white p-3" style={{ borderColor: C.line, boxShadow: sombra ? '0 8px 24px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2.5">
        {lead.foto_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={lead.foto_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: C.teal }}>{iniciais(lead.nome)}</span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold" style={{ color: C.ink }}>{lead.nome}</div>
          {lead.telefone && <div className="truncate text-[11.5px]" style={{ color: C.ink3 }}>{lead.telefone}</div>}
        </div>
      </div>
      {(lead.valor != null || lead.produto || lead.origem) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {lead.valor != null && lead.valor > 0 && (
            <span className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(0,168,132,0.10)', color: '#007e5f' }}>{brl(lead.valor)}</span>
          )}
          {lead.produto && <span className="truncate rounded-[6px] px-1.5 py-0.5 text-[11px]" style={{ background: '#eef1f5', color: C.ink2 }}>{lead.produto}</span>}
          {lead.origem && <span className="rounded-[6px] px-1.5 py-0.5 text-[10.5px]" style={{ background: '#eef1f5', color: C.ink3 }}>{lead.origem}</span>}
        </div>
      )}
    </div>
  )
}
