'use client'

import { Phone, Instagram, MessageCircle, ChevronRight, User } from 'lucide-react'
import { Lead, Usuario, STATUS_LABELS, KANBAN_COLUMNS } from './types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface LeadsTableProps {
  leads: Lead[]
  usuarios: Usuario[]
  onLeadClick: (lead: Lead) => void
  onLeadUpdate: (lead: Lead) => void
}

export function LeadsTable({ leads, usuarios, onLeadClick }: LeadsTableProps) {
  return (
    <div className="h-full overflow-auto px-6 py-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--crm-border))]">
            {['Lead', 'Contato', 'Produto', 'Status', 'Origem', 'Responsável', 'Última atividade', ''].map(h => (
              <th
                key={h}
                className="text-left text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide px-3 py-2 first:pl-0 last:pr-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(var(--crm-border))]">
          {leads.map(lead => {
            const responsavel = usuarios.find(u => u.id === lead.responsavel_id)
            const col = KANBAN_COLUMNS.find(c => c.id === lead.kanban_status)
            const ultimaAtividade = lead.ultima_mensagem_at
              ? formatDistanceToNow(new Date(lead.ultima_mensagem_at), { locale: ptBR, addSuffix: true })
              : null

            return (
              <tr
                key={lead.id}
                onClick={() => onLeadClick(lead)}
                className="group hover:bg-[hsl(var(--muted))]/40 cursor-pointer transition-colors"
              >
                {/* Nome */}
                <td className="px-3 py-3 first:pl-0">
                  <div className="flex items-center gap-2">
                    {(lead.msgs_nao_lidas ?? 0) > 0 && (
                      <span className="w-2 h-2 rounded-full bg-[hsl(var(--crm-brand))] flex-shrink-0" />
                    )}
                    <span className="font-medium text-[hsl(var(--crm-text-primary))] truncate max-w-[160px]">
                      {lead.nome ?? '—'}
                    </span>
                  </div>
                </td>

                {/* Contato */}
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-0.5">
                    {lead.telefone && (
                      <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--crm-text-muted))] font-mono">
                        <Phone className="w-3 h-3" />
                        {lead.telefone}
                      </span>
                    )}
                    {lead.instagram && (
                      <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--crm-text-muted))]">
                        <Instagram className="w-3 h-3" />
                        {lead.instagram}
                      </span>
                    )}
                  </div>
                </td>

                {/* Produto */}
                <td className="px-3 py-3">
                  <span className="text-[hsl(var(--crm-text-muted))] truncate max-w-[140px] block">
                    {lead.produto_interessado ?? '—'}
                  </span>
                </td>

                {/* Status */}
                <td className="px-3 py-3">
                  {col && (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${col.bgColor} ${col.color}`}>
                      <span>{col.icon}</span>
                      {col.label}
                    </span>
                  )}
                </td>

                {/* Origem */}
                <td className="px-3 py-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-muted))]">
                    {lead.origem ?? '—'}
                  </span>
                </td>

                {/* Responsável */}
                <td className="px-3 py-3">
                  {responsavel ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--crm-text-muted))]">
                      <User className="w-3 h-3" />
                      {responsavel.nome.split(' ')[0]}
                    </span>
                  ) : (
                    <span className="text-[hsl(var(--crm-text-subtle))]">—</span>
                  )}
                </td>

                {/* Última atividade */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    {(lead.msgs_nao_lidas ?? 0) > 0 && (
                      <MessageCircle className="w-3.5 h-3.5 text-[hsl(var(--crm-brand))]" />
                    )}
                    <span className="text-xs text-[hsl(var(--crm-text-subtle))]">
                      {ultimaAtividade ?? '—'}
                    </span>
                  </div>
                </td>

                {/* Ação */}
                <td className="px-3 py-3 last:pr-0">
                  <ChevronRight className="w-4 h-4 text-[hsl(var(--crm-text-subtle))] opacity-0 group-hover:opacity-100 transition-opacity" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {leads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-[hsl(var(--crm-text-subtle))]">
          <p className="text-lg">Nenhum lead encontrado</p>
          <p className="text-sm mt-1">Tente ajustar os filtros ou criar um novo lead</p>
        </div>
      )}
    </div>
  )
}
