'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  MouseSensor, TouchSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core'
import { Lead, Usuario, type KanbanColumn as KanbanColumnDef, type Motivo, CAMPOS_QUALIFICACAO } from './types'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { MotivoPerdaModal } from './motivo-perda-modal'
import { notify } from '@/components/ui'

interface KanbanBoardProps {
  leads: Lead[]
  usuarios: Usuario[]
  columns: KanbanColumnDef[]
  onLeadClick: (lead: Lead) => void
  onLeadUpdate: (lead: Lead) => void
  sla?: { verde: number; amarelo: number; vermelho: number }
  motivos?: Motivo[]
}

export function KanbanBoard({ leads, usuarios, columns, onLeadClick, onLeadUpdate, sla, motivos = [] }: KanbanBoardProps) {
  const [activeId,    setActiveId]    = useState<number | null>(null)
  const [localLeads,  setLocalLeads]  = useState<Lead[]>(leads)
  const [pendingPerda, setPendingPerda] = useState<Lead | null>(null)
  const [salvandoPerda, setSalvandoPerda] = useState(false)

  useEffect(() => { if (!activeId) setLocalLeads(leads) }, [leads, activeId])

  // Mouse: arrasta de imediato (distance). Touch: press-and-hold p/ arrastar,
  // deixando o swipe rápido rolar o board/coluna no celular.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

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

  // Grava a mudança de etapa (+ extras, ex.: motivo de perda) via route server,
  // que também dispara as automações de "entrou_na_etapa". Reverte no erro.
  async function persistirMove(lead: Lead, extra?: { motivo_perda_id?: number; perdido_em?: string; observacoes?: string }) {
    /**
     * AVISA O PAI ANTES DE GRAVAR. O card pulava de volta para a coluna de
     * origem no instante em que era solto e só ia para o destino quando o
     * servidor respondia.
     *
     * O motivo: `setActiveId(null)` dispara o efeito que ressincroniza a lista
     * local com a do pai — e a do pai ainda tinha a etapa antiga. Nenhum
     * servidor rápido resolveria isso; era ida e volta de UI.
     */
    const anterior = leads.find(l => l.id === lead.id)?.kanban_status ?? null
    const otimista = { ...lead, ...(extra ?? {}) }
    onLeadUpdate(otimista)

    const destino = columns.find(c => c.id === lead.kanban_status)?.label ?? lead.kanban_status
    notify.ok('Lead movido', destino)

    const res = await fetch('/api/leads/mover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, kanban_status: lead.kanban_status, ...(extra ?? {}) }),
    })
    if (!res.ok) {
      // Desfaz nos dois lugares: no pai (que é a fonte) e na lista local.
      onLeadUpdate({ ...lead, kanban_status: anterior })
      setLocalLeads(prev => prev.map(l => l.id === lead.id ? { ...l, kanban_status: anterior } : l))
      notify.bad('Erro ao mover o lead', 'O card voltou para a etapa anterior.')
      return false
    }
    return true
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

    const destCol = columns.find(c => c.id === lead.kanban_status)

    // Qualificação (Fase 4.6): bloqueia se faltar campo obrigatório da etapa.
    const faltando = (destCol?.camposObrigatorios ?? []).filter(campo => {
      const v = (lead as unknown as Record<string, unknown>)[campo]
      return v == null || v === '' || (campo === 'valor_estimado' && !Number(v))
    })
    if (faltando.length > 0) {
      const nomes = faltando.map(c => CAMPOS_QUALIFICACAO.find(x => x.key === c)?.label ?? c)
      notify.warn(`Para mover para "${destCol?.label}"`, `Preencha: ${nomes.join(', ')}.`)
      setLocalLeads(leads)
      return
    }

    // Etapa de perda: exige motivo antes de gravar (mantém o card no lugar
    // visualmente até confirmar; cancelar reverte).
    if (destCol?.tipo === 'perdido') { setPendingPerda(lead); return }

    await persistirMove(lead)
  }

  async function confirmarPerda(motivoId: number, observacao: string) {
    if (!pendingPerda) return
    setSalvandoPerda(true)
    const extra: { motivo_perda_id: number; perdido_em: string; observacoes?: string } = {
      motivo_perda_id: motivoId,
      perdido_em: new Date().toISOString(),
    }
    if (observacao) {
      // Rótulo e DATA no texto: a justificativa entra no meio das observações do
      // lead, e sem carimbo ninguém sabe, meses depois, se aquilo é de agora ou de
      // uma perda anterior — o mesmo lead pode ser perdido, voltar e ser perdido
      // de novo.
      const quando = new Date().toLocaleDateString('pt-BR')
      extra.observacoes = (pendingPerda.observacoes ? pendingPerda.observacoes + '\n' : '')
        + `Justificativa da perda (${quando}): ${observacao}`
    }
    await persistirMove(pendingPerda, extra)
    setSalvandoPerda(false)
    setPendingPerda(null)
  }

  function cancelarPerda() {
    setPendingPerda(null)
    setLocalLeads(leads) // desfaz o movimento visual
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

      {pendingPerda && (
        <MotivoPerdaModal
          leadNome={pendingPerda.nome ?? ''}
          motivos={motivos}
          loading={salvandoPerda}
          onConfirm={confirmarPerda}
          onCancel={cancelarPerda}
        />
      )}
    </DndContext>
  )
}
