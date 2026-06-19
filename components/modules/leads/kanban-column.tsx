'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Lead, Usuario, KanbanColumn as KanbanColumnType } from './types'
import { LeadCard } from './lead-card'

interface KanbanColumnProps {
  column: KanbanColumnType
  leads: Lead[]
  usuarios: Usuario[]
  isDragging: boolean
  onLeadClick: (lead: Lead) => void
}

export function KanbanColumn({ column, leads, usuarios, isDragging, onLeadClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${column.id}`,
    data: { status: column.id },
  })

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column Header */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${column.bgColor} border border-b-0 border-[hsl(var(--crm-border))]`}>
        <div className="flex items-center gap-2">
          <span className={`text-base leading-none ${column.color}`}>{column.icon}</span>
          <span className={`text-sm font-semibold ${column.color}`}>{column.label}</span>
        </div>
        <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded-full ${column.bgColor} ${column.color} border border-current/20`}>
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[400px] max-h-[calc(100vh-280px)] overflow-y-auto rounded-b-xl border border-[hsl(var(--crm-border))] p-2 flex flex-col gap-2 transition-colors ${
          isOver
            ? 'bg-[hsl(var(--crm-brand))]/5 border-[hsl(var(--crm-brand))]/40'
            : 'bg-[hsl(var(--crm-surface))]'
        }`}
      >
        <SortableContext
          items={leads.map(l => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              usuarios={usuarios}
              onClick={() => onLeadClick(lead)}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className={`flex-1 flex items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
            isOver
              ? 'border-[hsl(var(--crm-brand))]/40 bg-[hsl(var(--crm-brand))]/5'
              : 'border-[hsl(var(--crm-border))]'
          }`}>
            <p className="text-xs text-[hsl(var(--crm-text-subtle))]">
              {isDragging ? 'Soltar aqui' : 'Nenhum lead'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
