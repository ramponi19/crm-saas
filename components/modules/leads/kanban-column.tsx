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

  const emptyMsg =
    column.tipo === 'ganho'   ? 'Suas vendas fechadas aparecem aqui. 🎯' :
    column.tipo === 'perdido' ? 'Nada perdido — bom sinal.' :
    'Arraste um lead aqui.'

  return (
    <div className="flex flex-col flex-none w-[296px] h-full bg-[rgba(22,33,46,0.025)] border border-[#16212E]/[0.05] rounded-[16px] p-3">
      {/* Header da coluna */}
      <div className="flex items-center gap-[9px] px-1 pb-3 shrink-0">
        <span
          className="w-[9px] h-[9px] rounded-full flex-none"
          style={{ background: column.color }}
        />
        <span className="text-[13px] font-bold text-[#1F2A39] flex-1 truncate">{column.label}</span>
        <span className="font-mono text-[11px] text-[#6B7C92] bg-white border border-[#16212E]/[0.08] px-[8px] py-[2px] rounded-full">
          {leads.length}
        </span>
      </div>

      {/* Drop zone — rola por coluna */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-[9px] flex-1 min-h-[90px] overflow-y-auto scrollbar-thin rounded-[12px] transition-colors duration-150 p-0.5"
        style={{
          background: isOver ? `${column.color}0F` : 'transparent',
          outline: isOver ? `1px dashed ${column.color}55` : 'none',
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
          <div className="flex-1 min-h-[80px] flex items-center justify-center rounded-[12px] border border-dashed border-[#16212E]/[0.10] px-3 text-center">
            <p className="text-[12px] text-[#9AA7B6] leading-relaxed">
              {isDragging ? 'Soltar aqui' : emptyMsg}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
