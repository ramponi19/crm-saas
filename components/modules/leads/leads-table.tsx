'use client'

import { Phone, Instagram, MessageCircle, ChevronRight, User, Users } from 'lucide-react'
import { Lead, Usuario, KANBAN_COLUMNS, type KanbanColumn } from './types'
import { Table, Badge, Card, EmptyState, type Column } from '@/components/ui'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface LeadsTableProps {
  leads: Lead[]
  usuarios: Usuario[]
  onLeadClick: (lead: Lead) => void
  onLeadUpdate: (lead: Lead) => void
}

type BadgeTone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'

function statusTone(col: KanbanColumn): BadgeTone {
  if (col.tipo === 'ganho') return 'ok'
  if (col.tipo === 'perdido') return 'bad'
  if (col.tipo === 'negociacao') return 'warn'
  return 'acc'
}

export function LeadsTable({ leads, usuarios, onLeadClick }: LeadsTableProps) {
  const cols: Column<Lead>[] = [
    {
      key: 'lead', header: 'Lead',
      render: (lead) => (
        <div className="flex items-center gap-2">
          {(lead.msgs_nao_lidas ?? 0) > 0 && (
            <span className="h-2 w-2 flex-none rounded-full bg-accent" />
          )}
          <span className="truncate max-w-[160px] font-semibold text-ink">{lead.nome ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'contato', header: 'Contato', hideOnMobile: true,
      render: (lead) => (
        <div className="flex flex-col gap-0.5">
          {lead.telefone && (
            <span className="num inline-flex items-center gap-1 text-[11px] text-ink-2">
              <Phone size={12} strokeWidth={1.7} />
              {lead.telefone}
            </span>
          )}
          {lead.instagram && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-2">
              <Instagram size={12} strokeWidth={1.7} />
              {lead.instagram}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'produto', header: 'Produto', hideOnMobile: true,
      render: (lead) => <span className="truncate max-w-[140px] block text-ink-2">{lead.produto_interessado ?? '—'}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (lead) => {
        const col = KANBAN_COLUMNS.find(c => c.id === lead.kanban_status)
        return col ? <Badge tone={statusTone(col)} dot>{col.label}</Badge> : null
      },
    },
    {
      key: 'origem', header: 'Origem', hideOnMobile: true,
      render: (lead) => <Badge tone="neutro">{lead.origem ?? '—'}</Badge>,
    },
    {
      key: 'responsavel', header: 'Responsável', hideOnMobile: true,
      render: (lead) => {
        const responsavel = usuarios.find(u => u.id === lead.responsavel_id)
        return responsavel ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-2">
            <User size={12} strokeWidth={1.7} />
            {responsavel.nome.split(' ')[0]}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )
      },
    },
    {
      key: 'atividade', header: 'Última atividade', hideOnMobile: true,
      render: (lead) => {
        const ultimaAtividade = lead.ultima_mensagem_at
          ? formatDistanceToNow(new Date(lead.ultima_mensagem_at), { locale: ptBR, addSuffix: true })
          : null
        return (
          <div className="flex items-center gap-1">
            {(lead.msgs_nao_lidas ?? 0) > 0 && (
              <MessageCircle size={14} strokeWidth={1.7} className="text-accent" />
            )}
            <span className="text-[11px] text-ink-3">{ultimaAtividade ?? '—'}</span>
          </div>
        )
      },
    },
    {
      key: 'acao', header: '', align: 'right',
      render: () => <ChevronRight size={16} strokeWidth={1.7} className="text-ink-3" />,
    },
  ]

  return (
    <div className="h-full overflow-auto px-6 py-4">
      <Card flush>
        <Table
          columns={cols}
          rows={leads}
          rowKey={(lead) => lead.id}
          onRowClick={onLeadClick}
          empty={<EmptyState icon={<Users size={22} strokeWidth={1.7} />} title="Nenhum lead encontrado" description="Tente ajustar os filtros ou criar um novo lead." />}
        />
      </Card>
    </div>
  )
}
