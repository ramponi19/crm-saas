export type KanbanStatus = 'novo' | 'contato' | 'proposta' | 'negociacao' | 'convertido' | 'perdido'

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
  convertido_em: number | null
}

export interface Usuario {
  id: string
  nome: string
  role: 'admin' | 'vendedor' | 'tecnico'
}

export interface KanbanColumn {
  id: KanbanStatus
  label: string
  color: string
  bgColor: string
  icon: string
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'novo',
    label: 'Novo',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    icon: '✦',
  },
  {
    id: 'contato',
    label: 'Em Contato',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    icon: '◎',
  },
  {
    id: 'proposta',
    label: 'Proposta',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    icon: '◈',
  },
  {
    id: 'negociacao',
    label: 'Negociação',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    icon: '⬡',
  },
  {
    id: 'convertido',
    label: 'Convertido',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    icon: '✓',
  },
  {
    id: 'perdido',
    label: 'Perdido',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/40',
    icon: '✕',
  },
]

export const STATUS_LABELS: Record<KanbanStatus, string> = {
  novo: 'Novo',
  contato: 'Em Contato',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  convertido: 'Convertido',
  perdido: 'Perdido',
}
