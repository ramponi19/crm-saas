'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { Lead, Usuario, type KanbanColumn as KanbanColumnDef } from './types'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { notify } from '@/components/ui'

interface KanbanBoardProps {
  leads: Lead[]
  usuarios: Usuario[]
  columns: KanbanColumnDef[]
  onLeadClick: (lead: Lead) => void
  onLeadUpdate: (lead: Lead) => void
  sla?: { verde: number; amarelo: number; vermelho: number }
}

export function KanbanBoard({ leads, usuarios, columns, onLeadClick, onLeadUpdate, sla }: KanbanBoardProps) {
  const [activeId,    setActiveId]    = useState<number | null>(null)
  const [localLeads,  setLocalLeads]  = useState<Lead[]>(leads)

  useEffect(() => { if (!activeId) setLocalLeads(leads) }, [leads, activeId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const getLeadsByStatus = useCallback(
    (status: string) => localLeads.filter(l => (l.kanban_status ?? 'novo') === status),
    [localLeads]
  )

  const activeLead = activeId ? localLeads.find(l => l.id === activeId) : null
  const activeCol  = columns.find(c => c.id === (activeLead?.kanban_status ?? 'novo'))

  function handleDragStart(event: DragStartEvent) { setActiveId(event.active.id as number) }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeLeadId = active.id as number
    const overStatus   = over.data.current?.status as string | undefined
    const overLeadId   = over.data.current?.leadId as number | undefined
    if (!overStatus && !overLeadId) return
    const targetStatus = overStatus ?? localLeads.find(l => l.id === overLeadId)?.kanban_status
    if (!targetStatus) return
    setLocalLeads(prev => prev.map(l => l.id === activeLeadId ? { ...l, kanban_status: targetStatus } : l))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) { setLocalLeads(leads); return }
    const leadId = active.id as number
    const lead   = localLeads.find(l => l.id === leadId)
    if (!lead) return
    const originalStatus = leads.find(l => l.id === leadId)?.kanban_status
    if (lead.kanban_status === originalStatus) return
    const supabase = createClient()
    const { error } = await supabase
      .from('leads')
      .update({ kanban_status: lead.kanban_status, data_transferencia_funil: new Date().toISOString() })
      .eq('id', leadId)
    if (error) { notify.bad('Erro ao mover o lead'); setLocalLeads(leads); return }
    onLeadUpdate(lead)
    const destino = columns.find(c => c.id === lead.kanban_status)?.label ?? lead.kanban_status
    notify.ok('Lead movido', destino)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners}
      onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto px-6 py-4 pb-6 sm:snap-none">
        {columns.map(col => (
          <KanbanColumn
            key={col.id} column={col}
            leads={getLeadsByStatus(col.id)}
            usuarios={usuarios}
            isDragging={activeId !== null}
            onLeadClick={onLeadClick}
            sla={sla}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead && activeCol && (
          <div className="w-[228px] rotate-1 opacity-95">
            <LeadCard lead={activeLead} usuarios={usuarios} onClick={() => {}} isDragging barColor={activeCol.color} sla={sla} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
