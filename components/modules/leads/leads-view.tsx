'use client'

import { useState, useMemo } from 'react'
import { Search, LayoutGrid, List, Plus, SlidersHorizontal } from 'lucide-react'
import { Lead, Usuario } from './types'
import { KanbanBoard } from './kanban-board'
import { LeadsTable } from './leads-table'
import { LeadModal } from './lead-modal'
import { NewLeadModal } from './new-lead-modal'

interface LeadsViewProps {
  initialLeads: Lead[]
  usuarios: Usuario[]
}

export function LeadsView({ initialLeads, usuarios }: LeadsViewProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [search, setSearch] = useState('')
  const [filterOrigem, setFilterOrigem] = useState<string>('todos')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)

  const origens = useMemo(() => {
    const set = new Set(leads.map(l => l.origem).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [leads])

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchSearch =
        !search ||
        l.nome?.toLowerCase().includes(search.toLowerCase()) ||
        l.telefone?.includes(search) ||
        l.instagram?.toLowerCase().includes(search.toLowerCase()) ||
        l.produto_interessado?.toLowerCase().includes(search.toLowerCase())

      const matchOrigem =
        filterOrigem === 'todos' || l.origem === filterOrigem

      return matchSearch && matchOrigem
    })
  }, [leads, search, filterOrigem])

  const stats = useMemo(() => ({
    total: leads.length,
    novo: leads.filter(l => l.kanban_status === 'novo').length,
    em_contato: leads.filter(l => l.kanban_status === 'em_contato').length,
    negociando: leads.filter(l => l.kanban_status === 'negociando').length,
    convertido: leads.filter(l => l.kanban_status === 'convertido').length,
    perdido: leads.filter(l => l.kanban_status === 'perdido').length,
    naoLidas: leads.reduce((sum, l) => sum + (l.msgs_nao_lidas ?? 0), 0),
  }), [leads])

  function handleLeadUpdate(updated: Lead) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    if (selectedLead?.id === updated.id) setSelectedLead(updated)
  }

  function handleLeadCreate(created: Lead) {
    setLeads(prev => [created, ...prev])
    setShowNewLead(false)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-[hsl(var(--crm-border))]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="font-fraunces text-2xl font-medium text-[hsl(var(--crm-text-primary))]">
              Leads
            </h1>
            <p className="text-sm text-[hsl(var(--crm-text-muted))] mt-0.5">
              {stats.total} leads ativos
              {stats.naoLidas > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-[hsl(var(--crm-brand))]">
                  · {stats.naoLidas} mensagens não lidas
                </span>
              )}
            </p>
          </div>

          <button
            onClick={() => setShowNewLead(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--crm-brand))] text-white text-sm font-medium hover:bg-[hsl(var(--crm-brand-light))] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Lead
          </button>
        </div>

        {/* Mini stats */}
        <div className="flex gap-3 mb-4 overflow-x-auto pb-1">
          {[
            { label: 'Novos', value: stats.novo, color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
            { label: 'Em Contato', value: stats.em_contato, color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' },
            { label: 'Negociando', value: stats.negociando, color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
            { label: 'Convertido', value: stats.convertido, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
            { label: 'Perdido', value: stats.perdido, color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
          ].map(s => (
            <span
              key={s.label}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${s.color}`}
            >
              {s.label}
              <strong className="font-semibold">{s.value}</strong>
            </span>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--crm-text-subtle))]" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone, produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] placeholder:text-[hsl(var(--crm-text-subtle))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20 focus:border-[hsl(var(--crm-brand))]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-[hsl(var(--crm-text-subtle))]" />
            <select
              value={filterOrigem}
              onChange={e => setFilterOrigem(e.target.value)}
              className="text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
            >
              <option value="todos">Todas origens</option>
              {origens.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center rounded-lg border border-[hsl(var(--crm-border))] overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`p-2 transition-colors ${view === 'kanban' ? 'bg-[hsl(var(--crm-brand))] text-white' : 'hover:bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-muted))]'}`}
              title="Kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('table')}
              className={`p-2 transition-colors ${view === 'table' ? 'bg-[hsl(var(--crm-brand))] text-white' : 'hover:bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-muted))]'}`}
              title="Tabela"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'kanban' ? (
          <KanbanBoard
            leads={filteredLeads}
            usuarios={usuarios}
            onLeadClick={setSelectedLead}
            onLeadUpdate={handleLeadUpdate}
          />
        ) : (
          <LeadsTable
            leads={filteredLeads}
            usuarios={usuarios}
            onLeadClick={setSelectedLead}
            onLeadUpdate={handleLeadUpdate}
          />
        )}
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
