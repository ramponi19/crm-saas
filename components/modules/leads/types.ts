export type KanbanStatus = 'novo' | 'em_contato' | 'negociando' | 'convertido' | 'perdido'

export interface Lead {
  id: number
  nome: string | null
  telefone: string | null
  instagram: string | null
  origem: string | null
  kanban_status: KanbanStatus | null
  responsavel_id: string | null
  observacoes: string | null
  created_at: string | null
  ativo: boolean | null
  primeira_msg: string | null
  msgs_nao_lidas: number | null
  ultima_tratativa: string | null
  ultima_mensagem_at: string | null
  produto_interessado: string | null
  valor_estimado?: number | null
  convertido_em: number | null
}

export interface Usuario {
  id: string
  nome: string
  role: string
}

export interface KanbanColumn {
  id: KanbanStatus
  label: string
  color: string      // dot + accent color hex
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'novo',       label: 'Novo',       color: '#7FB0E8' },
  { id: 'em_contato', label: 'Em contato', color: '#C6A86A' },
  { id: 'negociando', label: 'Negociando', color: '#F4B740' },
  { id: 'convertido', label: 'Convertido', color: '#34D399' },
  { id: 'perdido',    label: 'Perdido',    color: '#F0656B' },
]

export const STATUS_LABELS: Record<KanbanStatus, string> = {
  novo: 'Novo', em_contato: 'Em contato', negociando: 'Negociando',
  convertido: 'Convertido', perdido: 'Perdido',
}
