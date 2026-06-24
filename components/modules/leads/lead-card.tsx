'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clock } from 'lucide-react'
import { Lead, Usuario } from './types'
import { formatCurrency } from '@/lib/utils'

interface LeadCardProps {
  lead: Lead
  usuarios: Usuario[]
  onClick: () => void
  isDragging?: boolean
  barColor: string
  sla?: { verde: number; amarelo: number; vermelho: number }
}

// Ícones de origem — SVG inline com as cores oficiais (igual modelo)
const ORIGEM_ICONS: Record<string, { color: string; svg: React.ReactNode }> = {
  whatsapp: {
    color: '#25D366',
    svg: <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-1.14.07-1.84-.12-.42-.13-.97-.31-1.66-.61-2.93-1.27-4.85-4.22-5-4.42-.15-.2-1.2-1.59-1.2-3.03 0-1.44.76-2.15 1.02-2.44.27-.29.59-.37.79-.37.2 0 .39 0 .57.01.18.01.43-.07.67.51.24.6.83 2.04.9 2.19.07.15.12.32.02.51-.09.2-.14.32-.27.49-.14.17-.29.38-.41.51-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.12.59-.07.16-.2.68-.79.86-1.06.18-.27.36-.22.61-.13.25.09 1.58.74 1.86.88.27.14.46.2.52.31.07.12.07.66-.17 1.34z" fill="currentColor"/>,
  },
  instagram: {
    color: '#E1487B',
    svg: <><rect x="2" y="2" width="20" height="20" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/></>,
  },
  messenger: {
    color: '#3B9BFF',
    svg: <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.19.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.53-.04 1.91.53 3.92.5 5.81-.07C20.36 19.85 22 16.04 22 11.7 22 6.13 17.64 2 12 2zm6 7.46l-2.94 4.66c-.47.74-1.47.93-2.18.4l-2.34-1.75a.6.6 0 00-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.4l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63z" fill="currentColor"/>,
  },
  manual: {
    color: '#9FB0C2',
    svg: <><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" fill="none" stroke="currentColor" strokeWidth="2"/></>,
  },
}

const AVATAR_COLORS = ['#D7282F','#7FB0E8','#34D399','#F4B740','#C6A86A','#a855f7']
const getAvatarColor = (nome: string) => AVATAR_COLORS[nome.charCodeAt(0) % AVATAR_COLORS.length]
const getInitials    = (nome: string) => nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()

const DEFAULT_SLA = { verde: 15, amarelo: 30, vermelho: 60 }

function getSlaColor(date: string | null, sla = DEFAULT_SLA): string {
  if (!date) return '#6B7C92'
  const min = (Date.now() - new Date(date).getTime()) / 60_000
  if (min < sla.verde)    return '#34D399'
  if (min < sla.amarelo)  return '#F4B740'
  return '#F0656B'
}

// Relógio em h:m:s desde a última atividade
function formatElapsed(date: string | null): string {
  if (!date) return '00:00:00'
  let s = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000))
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60);   s -= m * 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function LeadCard({ lead, usuarios, onClick, isDragging = false, barColor, sla }: LeadCardProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: lead.id, data: { leadId: lead.id } })

  const style = { transform: CSS.Transform.toString(transform), transition }

  const responsavel = usuarios.find(u => u.id === lead.responsavel_id)
  const temMsgs     = (lead.msgs_nao_lidas ?? 0) > 0
  const lastAt      = lead.ultima_mensagem_at ?? lead.ultima_tratativa
  const slaColor    = getSlaColor(lastAt, sla)
  const origem      = ORIGEM_ICONS[lead.origem ?? 'manual'] ?? ORIGEM_ICONS.manual

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onClick} className="cursor-pointer select-none">
      <div
        className="rounded-[13px] p-[14px_15px] transition-transform duration-200 hover:-translate-y-[2px] border border-[#16212E]/[0.08]"
        style={{
          background: '#FFFFFF',
          borderLeft: `3px solid ${barColor}`,
          opacity: isSortableDragging || isDragging ? 0.4 : 1,
        }}
      >
        {/* Linha 1: badge msgs + nome + ícone origem */}
        <div className="flex items-center gap-[9px] mb-[7px]">
          {temMsgs && (
            <span className="min-w-[22px] h-[22px] px-[6px] rounded-full flex items-center justify-center font-mono text-[11px] font-bold text-white flex-none"
              style={{ background: '#D7282F' }}>
              {(lead.msgs_nao_lidas ?? 0) > 99 ? '99+' : lead.msgs_nao_lidas}
            </span>
          )}
          <div className="flex-1 text-[14px] font-semibold text-[#1F2A39] truncate">
            {lead.nome ?? 'Lead sem nome'}
          </div>
          <svg width={18} height={18} viewBox="0 0 24 24" className="flex-none" style={{ color: origem.color }}>
            {origem.svg}
          </svg>
        </div>

        {/* Produto interessado */}
        <div className="text-[12px] text-[#7E8EA2] mb-[9px] truncate">
          {lead.produto_interessado || 'Sem produto definido'}
        </div>

        {/* Linha de espera (SLA) — relógio h:m:s */}
        {lastAt && (
          <div className="flex items-center gap-[6px] mb-[9px]">
            <span className="w-[8px] h-[8px] rounded-full flex-none" style={{ background: slaColor, boxShadow: `0 0 7px ${slaColor}` }} />
            <Clock size={13} style={{ color: slaColor }} />
            <span className="font-mono text-[11px] font-semibold" style={{ color: slaColor }}>
              {formatElapsed(lastAt)}
            </span>
            <span className="flex-1" />
            <span className="font-mono text-[9.5px] text-[#788698]">
              {new Date(lastAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        )}

        {/* Linha 3: valor + avatar */}
        <div className="flex items-center justify-between mt-[11px]">
          <span className="text-[13.5px] font-bold text-[#16212E]">
            {lead.valor_estimado ? formatCurrency(lead.valor_estimado) : '—'}
          </span>
          {responsavel ? (
            <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-[10.5px] font-bold text-white"
              style={{ background: getAvatarColor(responsavel.nome) }}>
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
