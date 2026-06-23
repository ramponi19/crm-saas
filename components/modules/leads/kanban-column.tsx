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
  sla?: { verde: number; amarelo: number; vermelho: number }
}

export function KanbanColumn({ column, leads, usuarios, isDragging, onLeadClick, sla }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${column.id}`,
    data: { status: column.id },
  })

  return (
    <div className="flex flex-col flex-none w-[286px]">
      {/* Header da coluna */}
      <div className="flex items-center gap-[9px] px-1 pb-[14px]">
        <span
          className="w-[9px] h-[9px] rounded-full flex-none"
          style={{ background: column.color }}
        />
        <span className="text-[13.5px] font-bold text-[#1F2A39]">{column.label}</span>
        <span className="font-mono text-[11px] text-[#6B7C92] bg-white/[0.05] px-[8px] py-[2px] rounded-full">
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-[11px] min-h-[90px] rounded-[13px] transition-colors duration-150"
        style={{
          background: isOver ? `${column.color}08` : 'transparent',
          outline: isOver ? `1px dashed ${column.color}44` : 'none',
          padding: isOver ? '8px' : '0',
        }}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              usuarios={usuarios}
              onClick={() => onLeadClick(lead)}
              barColor={column.color}
              sla={sla}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex-1 min-h-[80px] flex items-center justify-center rounded-[13px] border border-dashed border-[#16212E]/[0.08]">
            <p className="text-[12px] text-[#9AA7B6]">
              {isDragging ? 'Soltar aqui' : 'Nenhum lead'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
