'use client'

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Lead, Usuario } from './types'
import { KanbanBoard } from './kanban-board'
import { LeadModal } from './lead-modal'
import { NewLeadModal } from './new-lead-modal'

interface LeadsViewProps {
  initialLeads: Lead[]
  usuarios: Usuario[]
}

export function LeadsView({ initialLeads, usuarios }: LeadsViewProps) {
  const [leads,          setLeads]          = useState<Lead[]>(initialLeads)
  const [selectedLead,   setSelectedLead]   = useState<Lead | null>(null)
  const [showNewLead,    setShowNewLead]    = useState(false)

  const stats = useMemo(() => {
    const ativos    = leads.filter(l => l.ativo !== false)
    const conv      = ativos.filter(l => l.kanban_status === 'convertido').length
    const taxa      = ativos.length > 0 ? Math.round((conv / ativos.length) * 100) : 0
    const negoc     = ativos
      .filter(l => l.kanban_status === 'negociando')
      .reduce((s, l) => s + (l.valor_estimado ?? 0), 0)
    return { ativos: ativos.length, taxa, negoc }
  }, [leads])

  function handleLeadUpdate(updated: Lead) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    if (selectedLead?.id === updated.id) setSelectedLead(updated)
  }

  function handleLeadCreate(created: Lead) {
    setLeads(prev => [created, ...prev])
    setShowNewLead(false)
  }

  const fmtK = (v: number) =>
    v >= 1000
      ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')}k`
      : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-[30px] pt-[22px] pb-5">
        <div className="flex items-center gap-7 flex-wrap">
          {/* Stats */}
          <div>
            <div className="font-serif text-[25px] text-[#F4F6F9]">{stats.ativos}</div>
            <div className="text-[11.5px] text-[#6B7C92]">leads ativos</div>
          </div>
          <div>
            <div className="font-serif text-[25px] text-[#34D399]">{stats.taxa}%</div>
            <div className="text-[11.5px] text-[#6B7C92]">taxa de conversão</div>
          </div>
          <div>
            <div className="font-serif text-[25px] text-[#F4F6F9]">{fmtK(stats.negoc)}</div>
            <div className="text-[11.5px] text-[#6B7C92]">em negociação</div>
          </div>

          <div className="flex-1" />

          {/* Novo lead */}
          <button
            onClick={() => setShowNewLead(true)}
            className="flex items-center gap-2 px-[18px] py-[11px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13.5px] shadow-[0_6px_18px_rgba(215,40,47,0.32)] hover:-translate-y-[2px] transition-all"
          >
            <Plus size={17} /> Novo lead
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <KanbanBoard
          leads={leads}
          usuarios={usuarios}
          onLeadClick={setSelectedLead}
          onLeadUpdate={handleLeadUpdate}
        />
      </div>

      {/* Modais */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          usuarios={usuarios}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
        />
      )}
      {showNewLead && (
        <NewLeadModal
          usuarios={usuarios}
          onClose={() => setShowNewLead(false)}
          onCreate={handleLeadCreate}
        />
      )}
    </div>
  )
}
