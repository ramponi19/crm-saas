'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clock } from 'lucide-react'
import { Lead, Usuario } from './types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface LeadCardProps {
  lead: Lead
  usuarios: Usuario[]
  onClick: () => void
  isDragging?: boolean
  barColor: string
}

const ORIGEM_META: Record<string, { icon: string; color: string }> = {
  whatsapp:  { icon: '💬', color: '#34D399' },
  instagram: { icon: '📸', color: '#F0656B' },
  site:      { icon: '🌐', color: '#7FB0E8' },
  indicacao: { icon: '🤝', color: '#F4B740' },
  loja:      { icon: '🏪', color: '#C6A86A' },
}

const AVATAR_COLORS = ['#D7282F','#7FB0E8','#34D399','#F4B740','#C6A86A','#a855f7']
const getAvatarColor = (nome: string) => AVATAR_COLORS[nome.charCodeAt(0) % AVATAR_COLORS.length]
const getInitials    = (nome: string) => nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()

function formatWait(date: string | null) {
  if (!date) return null
  return formatDistanceToNow(new Date(date), { locale: ptBR, addSuffix: false })
}

function getSlaColor(date: string | null): string {
  if (!date) return '#6B7C92'
  const h = (Date.now() - new Date(date).getTime()) / 3_600_000
  if (h < 4)  return '#34D399'
  if (h < 24) return '#F4B740'
  return '#F0656B'
}

export function LeadCard({ lead, usuarios, onClick, isDragging = false, barColor }: LeadCardProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: lead.id, data: { leadId: lead.id } })

  const style = { transform: CSS.Transform.toString(transform), transition }

  const responsavel = usuarios.find(u => u.id === lead.responsavel_id)
  const temMsgs     = (lead.msgs_nao_lidas ?? 0) > 0
  const lastAt      = lead.ultima_mensagem_at ?? lead.ultima_tratativa
  const slaColor    = getSlaColor(lastAt)
  const waitLabel   = formatWait(lastAt)
  const origem      = ORIGEM_META[lead.origem ?? ''] ?? { icon: '💬', color: '#6B7C92' }

  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onClick}
      className="cursor-pointer select-none"
      style-hover="transform:translateY(-2px)"
    >
      <div
        className="rounded-[13px] border border-white/[0.06] p-[14px_15px] transition-transform duration-200 hover:-translate-y-[2px]"
        style={{
          background: '#122036',
          borderLeft: `3px solid ${barColor}`,
          opacity: isSortableDragging || isDragging ? 0.4 : 1,
        }}
      >
        {/* Linha 1: badge msgs + nome + ícone origem */}
        <div className="flex items-center gap-[9px] mb-[7px]">
          {temMsgs && (
            <span
              className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-[10.5px] font-bold text-white flex-none"
              style={{ background: slaColor }}
            >
              {(lead.msgs_nao_lidas ?? 0) > 9 ? '9+' : lead.msgs_nao_lidas}
            </span>
          )}
          <div className="flex-1 text-[14px] font-semibold text-[#E9EEF4] truncate">
            {lead.nome ?? 'Lead sem nome'}
          </div>
          <span className="text-[18px] flex-none" title={lead.origem ?? ''}>
            {origem.icon}
          </span>
        </div>

        {/* Produto interessado */}
        {lead.produto_interessado && (
          <div className="text-[12px] text-[#7E8EA2] mb-[9px] truncate">
            {lead.produto_interessado}
          </div>
        )}

        {/* Linha de espera (SLA) */}
        {lastAt && waitLabel && (
          <div className="flex items-center gap-[6px] mb-[9px]">
            <span className="w-[8px] h-[8px] rounded-full flex-none" style={{ background: slaColor, boxShadow: `0 0 7px ${slaColor}` }} />
            <Clock size={13} style={{ color: slaColor }} />
            <span className="font-mono text-[11px] font-semibold" style={{ color: slaColor }}>
              {waitLabel}
            </span>
            <span className="flex-1" />
            <span className="font-mono text-[9.5px] text-[#5C6E84]">
              {new Date(lastAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        )}

        {/* Linha 3: valor + avatar responsável */}
        <div className="flex items-center justify-between mt-[11px]">
          <span className="text-[13.5px] font-bold text-[#F0656B]">
            {lead.valor_estimado
              ? lead.valor_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              : '—'}
          </span>
          {responsavel ? (
            <div
              className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-[10.5px] font-bold text-white"
              style={{ background: getAvatarColor(responsavel.nome) }}
            >
              {getInitials(responsavel.nome)}
            </div>
          ) : (
            <div className="w-[28px] h-[28px] rounded-[8px] bg-white/[0.06]" />
          )}
        </div>
      </div>
    </div>
  )
}
