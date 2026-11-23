'use client'

import type { ReactNode } from 'react'
import { useState, useCallback, useEffect } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  MouseSensor, TouchSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core'
import { Lead, Usuario, type KanbanColumn as KanbanColumnDef, type Motivo, CAMPOS_QUALIFICACAO } from './types'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { MotivoPerdaModal } from './motivo-perda-modal'
import { GanhoModal, type VendaDoModal } from './ganho-modal'
import { ReabrirVendaModal } from './reabrir-venda-modal'
import { useSouAdmin } from './use-sou-admin'
import { notify } from '@/components/ui'
import { ordenarQuadro, type ContagemDaEtapa } from '@/lib/quadro'
import { lerValor } from '@/lib/venda-ganho'

interface KanbanBoardProps {
  leads: Lead[]
  usuarios: Usuario[]
  columns: KanbanColumnDef[]
  onLeadClick: (lead: Lead) => void
  onLeadUpdate: (lead: Lead) => void
  sla?: { verde: number; amarelo: number; vermelho: number }
  motivos?: Motivo[]
  /** Instante do 1º desenho, igual no servidor e no navegador (ver leads/page.tsx). */
  agora?: number
  /** Total, valor e aguardando por etapa, da base inteira (o quadro mostra só o começo de cada coluna). */
  contagens?: Record<string, ContagemDaEtapa>
  /** Quantos de cada etapa ainda não estão na tela. */
  restam?: Record<string, number>
  carregandoMais?: Record<string, boolean>
  onCarregarMais?: (etapa: string) => void
  /** Automatize: rodapé de cada coluna (modo ligado). */
  rodapeDaColuna?: (etapa: string, label: string) => ReactNode
  /** Como a empresa chama o item usado, no modal de venda fechada (PerfilDoLead.rotuloUsado). */
  rotuloUsado?: string
}

export function KanbanBoard({ leads, usuarios, columns, onLeadClick, onLeadUpdate, sla, motivos = [], agora, contagens, restam, carregandoMais, onCarregarMais, rodapeDaColuna, rotuloUsado }: KanbanBoardProps) {
  const [activeId,    setActiveId]    = useState<number | null>(null)
  const [localLeads,  setLocalLeads]  = useState<Lead[]>(leads)
  const [pendingPerda, setPendingPerda] = useState<Lead | null>(null)
  const [salvandoPerda, setSalvandoPerda] = useState(false)
  /** Venda fechada (23/11/2026): entrar no ganho pede data, categoria, condição e valor. */
  const [pendingGanho, setPendingGanho] = useState<Lead | null>(null)
  const [salvandoGanho, setSalvandoGanho] = useState(false)
  const [erroGanho, setErroGanho] = useState<{ campo?: string; erro: string } | null>(null)
  /** Sair do ganho pede o motivo (só dono/admin); se o destino é a perda, o motivo da perda vem depois. */
  const [pendingReabrir, setPendingReabrir] = useState<Lead | null>(null)
  const [salvandoReabrir, setSalvandoReabrir] = useState(false)
  const [motivoReabertura, setMotivoReabertura] = useState<string | null>(null)
  const souAdmin = useSouAdmin(usuarios)

  useEffect(() => { if (!activeId) setLocalLeads(leads) }, [leads, activeId])

  // Mouse: arrasta de imediato (distance). Touch: press-and-hold p/ arrastar,
  // deixando o swipe rápido rolar o board/coluna no celular.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const getLeadsByStatus = useCallback(
    (status: string) => ordenarQuadro(localLeads.filter(l => (l.kanban_status ?? 'novo') === status)),
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
  type Extra = { motivo_perda_id?: number; perdido_em?: string; justificativa?: string; venda?: VendaDoModal; motivo_reabertura?: string }
  type Resposta = { ok: boolean; codigo?: string; campo?: string; error?: string }
  async function persistirMove(lead: Lead, extra?: Extra): Promise<Resposta> {
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
    const { justificativa: _justificativa, venda, motivo_reabertura: _motivo, ...doLead } = extra ?? {}
    const otimista = { ...lead, ...doLead, ...(venda ? { valor_estimado: lerValor(venda.valor) || lead.valor_estimado } : {}) }
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
      const j = await res.json().catch(() => ({})) as { error?: string; codigo?: string; campo?: string }
      // Dado da venda recusado pelo servidor: o modal continua aberto e mostra o erro no campo.
      if (j.codigo !== 'GANHO_DADOS') notify.bad('Erro ao mover o lead', `${j.error ? j.error + ' ' : ''}O card voltou para a etapa anterior.`)
      return { ok: false, codigo: j.codigo, campo: j.campo, error: j.error }
    }
    return { ok: true }
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

    const origCol = columns.find(c => c.id === originalStatus)

    // Venda fechada NÃO sai do ganho pelo arrasto sem motivo (23/11/2026): só dono/admin, e o
    // banco confere de novo. Para os outros, o card volta e a tela diz por quê.
    if (origCol?.tipo === 'ganho' && destCol?.tipo !== 'ganho') {
      if (!souAdmin) {
        notify.warn('Venda fechada', 'Só o dono ou um administrador reabre uma venda.')
        setLocalLeads(leads)
        return
      }
      setPendingReabrir(lead)
      return
    }

    // Entrar no ganho pede os dados da venda antes de gravar (o card fica no lugar até confirmar).
    if (destCol?.tipo === 'ganho' && origCol?.tipo !== 'ganho') { setErroGanho(null); setPendingGanho(lead); return }

    // Etapa de perda: exige motivo antes de gravar (mantém o card no lugar
    // visualmente até confirmar; cancelar reverte).
    if (destCol?.tipo === 'perdido') { setPendingPerda(lead); return }

    await persistirMove(lead)
  }

  async function confirmarGanho(venda: VendaDoModal) {
    if (!pendingGanho) return
    setSalvandoGanho(true)
    const r = await persistirMove(pendingGanho, { venda })
    setSalvandoGanho(false)
    if (r.ok) { setPendingGanho(null); setErroGanho(null); return }
    if (r.codigo === 'GANHO_DADOS') { setErroGanho({ campo: r.campo, erro: r.error ?? 'Confira os dados da venda.' }); return }
    setPendingGanho(null)
  }

  function cancelarGanho() {
    setPendingGanho(null)
    setErroGanho(null)
    setLocalLeads(leads)
  }

  async function confirmarReabrir(motivo: string) {
    if (!pendingReabrir) return
    const destCol = columns.find(c => c.id === pendingReabrir.kanban_status)
    // Indo para a perda: guarda o motivo da reabertura e pede o da perda.
    if (destCol?.tipo === 'perdido') { setMotivoReabertura(motivo); setPendingPerda(pendingReabrir); setPendingReabrir(null); return }
    setSalvandoReabrir(true)
    await persistirMove(pendingReabrir, { motivo_reabertura: motivo })
    setSalvandoReabrir(false)
    setPendingReabrir(null)
  }

  function cancelarReabrir() {
    setPendingReabrir(null)
    setLocalLeads(leads)
  }

  async function confirmarPerda(motivoId: number, observacao: string) {
    if (!pendingPerda) return
    setSalvandoPerda(true)
    const extra: { motivo_perda_id: number; perdido_em: string; justificativa?: string } = {
      motivo_perda_id: motivoId,
      perdido_em: new Date().toISOString(),
    }
    // A justificativa vai para o fim das observações do contato, com rótulo e DATA
    // (o mesmo lead pode ser perdido, voltar e ser perdido de novo) — emendada no
    // SERVIDOR (/api/leads/mover): o cartão do quadro não traz as observações
    // (04/11/2026), e montar o texto aqui apagaria o que já estava lá.
    if (observacao) extra.justificativa = observacao
    await persistirMove(pendingPerda, { ...extra, ...(motivoReabertura ? { motivo_reabertura: motivoReabertura } : {}) })
    setSalvandoPerda(false)
    setPendingPerda(null)
    setMotivoReabertura(null)
  }

  function cancelarPerda() {
    setPendingPerda(null)
    setMotivoReabertura(null)
    setLocalLeads(leads) // desfaz o movimento visual
  }

  return (
    // `id` fixo: sem ele o @dnd-kit numera o aria-describedby com um contador que
    // nunca zera no servidor (DndDescribedBy-0, -1, -2… a cada requisição), e o
    // navegador começa do 0. O cartão apontava para uma descrição inexistente e
    // o leitor de tela perdia as instruções de arrastar.
    <DndContext id="leads-kanban" sensors={sensors} collisionDetection={closestCorners}
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
            agora={agora}
            contagem={contagens?.[col.id]}
            restam={restam?.[col.id] ?? 0}
            carregandoMais={!!carregandoMais?.[col.id]}
            onCarregarMais={onCarregarMais ? () => onCarregarMais(col.id) : undefined}
            rodape={rodapeDaColuna?.(col.id, col.label)}
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

      {pendingGanho && (
        <GanhoModal
          leadNome={pendingGanho.nome ?? ''}
          valorInicial={pendingGanho.valor_estimado ?? null}
          rotuloUsado={rotuloUsado}
          loading={salvandoGanho}
          erroServidor={erroGanho}
          onConfirm={confirmarGanho}
          onCancel={cancelarGanho}
        />
      )}

      {pendingReabrir && (
        <ReabrirVendaModal
          leadNome={pendingReabrir.nome ?? ''}
          loading={salvandoReabrir}
          onConfirm={confirmarReabrir}
          onCancel={cancelarReabrir}
        />
      )}
    </DndContext>
  )
}
