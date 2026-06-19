'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MessageCircle, Phone, Instagram, Clock, User } from 'lucide-react'
import { Lead, Usuario } from './types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface LeadCardProps {
  lead: Lead
  usuarios: Usuario[]
  onClick: () => void
  isDragging?: boolean
}

export function LeadCard({ lead, usuarios, onClick, isDragging = false }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: lead.id,
    data: { leadId: lead.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const responsavel = usuarios.find(u => u.id === lead.responsavel_id)
  const temMensagensNaoLidas = (lead.msgs_nao_lidas ?? 0) > 0

  const ultimaAtividade = lead.ultima_mensagem_at
    ? formatDistanceToNow(new Date(lead.ultima_mensagem_at), { locale: ptBR, addSuffix: true })
    : lead.ultima_tratativa
    ? formatDistanceToNow(new Date(lead.ultima_tratativa), { locale: ptBR, addSuffix: true })
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        group relative rounded-xl border bg-[hsl(var(--crm-surface))] p-3 cursor-pointer
        transition-all duration-150 select-none
        ${isSortableDragging || isDragging
          ? 'opacity-40 shadow-2xl border-[hsl(var(--crm-brand))]/40'
          : 'border-[hsl(var(--crm-border))] hover:border-[hsl(var(--crm-brand))]/30 hover:shadow-md hover:-translate-y-0.5'
        }
        ${temMensagensNaoLidas ? 'ring-1 ring-[hsl(var(--crm-brand))]/30' : ''}
      `}
    >
      {/* Badge de msgs não lidas */}
      {temMensagensNaoLidas && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[hsl(var(--crm-brand))] text-white text-[10px] font-bold flex items-center justify-center">
          {lead.msgs_nao_lidas! > 9 ? '9+' : lead.msgs_nao_lidas}
        </span>
      )}

      {/* Nome */}
      <p className="text-sm font-semibold text-[hsl(var(--crm-text-primary))] mb-1 truncate">
        {lead.nome ?? 'Lead sem nome'}
      </p>

      {/* Produto */}
      {lead.produto_interessado && (
        <p className="text-xs text-[hsl(var(--crm-text-muted))] mb-2 truncate">
          {lead.produto_interessado}
        </p>
      )}

      {/* Contatos */}
      <div className="flex items-center gap-2 mb-2">
        {lead.telefone && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--crm-text-subtle))]">
            <Phone className="w-3 h-3" />
            <span className="font-mono">{lead.telefone.slice(-8)}</span>
          </span>
        )}
        {lead.instagram && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--crm-text-subtle))]">
            <Instagram className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{lead.instagram}</span>
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Origem */}
          {lead.origem && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-muted))] font-medium">
              {lead.origem}
            </span>
          )}
          {/* Msgs */}
          {(lead.msgs_nao_lidas ?? 0) === 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[hsl(var(--crm-text-subtle))]">
              <MessageCircle className="w-3 h-3" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Responsável */}
          {responsavel && (
            <span
              title={responsavel.nome}
              className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--crm-text-subtle))]"
            >
              <User className="w-3 h-3" />
              <span className="truncate max-w-[60px]">{responsavel.nome.split(' ')[0]}</span>
            </span>
          )}

          {/* Tempo */}
          {ultimaAtividade && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[hsl(var(--crm-text-subtle))]">
              <Clock className="w-3 h-3" />
              <span>{ultimaAtividade.replace('há ', '').replace(' atrás', '')}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
