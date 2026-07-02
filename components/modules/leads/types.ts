// kanban_status agora é dinâmico (varia por segmento) — string livre.
export type KanbanStatus = string

export interface Lead {
  id: number
  nome: string | null
  telefone: string | null
  instagram: string | null
  origem: string | null
  kanban_status: string | null
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
  id: string
  label: string
  color: string                                  // dot + accent color hex
  tipo?: 'ganho' | 'negociacao' | 'perdido'      // papel da etapa (p/ métricas)
}

// Funil padrão (varejo / genérico) — não muda o comportamento atual.
export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'novo',       label: 'Novo',       color: '#7FB0E8' },
  { id: 'em_contato', label: 'Em contato', color: '#C6A86A' },
  { id: 'negociando', label: 'Negociando', color: '#F4B740', tipo: 'negociacao' },
  { id: 'convertido', label: 'Convertido', color: '#34D399', tipo: 'ganho' },
  { id: 'perdido',    label: 'Perdido',    color: '#F0656B', tipo: 'perdido' },
]

// Funil imobiliário (segmento 'imobiliaria').
const KANBAN_IMOBILIARIA: KanbanColumn[] = [
  { id: 'novo',             label: 'Lead novo',          color: '#7FB0E8' },
  { id: 'contato',          label: 'Contato feito',      color: '#C6A86A' },
  { id: 'visita_agendada',  label: 'Visita agendada',    color: '#A78BFA' },
  { id: 'visita_realizada', label: 'Visita realizada',   color: '#22D3EE' },
  { id: 'proposta',         label: 'Proposta',           color: '#F4B740', tipo: 'negociacao' },
  { id: 'credito',          label: 'Análise de crédito', color: '#FB923C' },
  { id: 'fechamento',       label: 'Fechamento',         color: '#34D399', tipo: 'ganho' },
  { id: 'perdido',          label: 'Perdido',            color: '#F0656B', tipo: 'perdido' },
]

const KANBAN_POR_SEGMENTO: Record<string, KanbanColumn[]> = {
  imobiliaria: KANBAN_IMOBILIARIA,
}

/** Colunas do kanban conforme o segmento (fallback = funil padrão). */
export function getKanbanColumns(segmento?: string | null): KanbanColumn[] {
  return (segmento && KANBAN_POR_SEGMENTO[segmento]) || KANBAN_COLUMNS
}

/** Id da etapa "ganho" (convertido/fechamento) do conjunto de colunas. */
export function ganhoColId(cols: KanbanColumn[]): string {
  return cols.find(c => c.tipo === 'ganho')?.id ?? 'convertido'
}
