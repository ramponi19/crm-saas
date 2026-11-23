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
  /**
   * Última mensagem de cada lado, mantidas por trigger no banco. É com elas que
   * o card sabe se o cliente está esperando: relógio só corre quando ele falou
   * por último.
   */
  ultima_recebida_at?: string | null
  ultima_enviada_at?: string | null
  produto_interessado: string | null
  valor_estimado?: number | null
  convertido_em: number | null
  motivo_perda_id?: number | null
  perdido_em?: string | null
  /** Data da venda (venda fechada). Só muda por corrigir_data_venda (dono/admin). */
  ganho_em?: string | null
  funil_id?: number | null
  /** Foto de perfil (Instagram/Messenger). WhatsApp não expõe foto. */
  foto_url?: string | null
  /** Etiquetas do contato (contatos.etiqueta_ids, 11/11/2026). */
  etiqueta_ids?: number[]
}

/** Funil (Fase 4.1) — uma empresa pode ter vários. */
export interface Funil {
  id: number
  nome: string
  padrao: boolean
}

export interface Usuario {
  id: string
  nome: string
  role: string
}

/** Motivo de perda configurável por empresa (Fase 4.2). */
export interface Motivo {
  id: number
  label: string
}

export interface KanbanColumn {
  id: string
  label: string
  color: string                                  // dot + accent color hex
  tipo?: 'ganho' | 'negociacao' | 'perdido'      // papel da etapa (p/ métricas)
  funilId?: number                               // funil a que a etapa pertence (Fase 4.1)
  camposObrigatorios?: string[]                  // campos do lead exigidos p/ entrar (Fase 4.6)
}

/** Campos qualificáveis por etapa (Fase 4.6). */
export const CAMPOS_QUALIFICACAO: { key: string; label: string }[] = [
  { key: 'telefone', label: 'Telefone' },
  { key: 'valor_estimado', label: 'Valor estimado' },
  { key: 'responsavel_id', label: 'Responsável' },
  { key: 'produto_interessado', label: 'Produto' },
]

// Funil padrão (varejo / genérico) — não muda o comportamento atual.
export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'novo',       label: 'Novo',       color: '#7FB0E8' },
  { id: 'em_contato', label: 'Em contato', color: '#C6A86A' },
  { id: 'negociando', label: 'Negociando', color: '#F4B740', tipo: 'negociacao' },
  { id: 'convertido', label: 'Convertido', color: '#34D399', tipo: 'ganho' },
  { id: 'perdido',    label: 'Perdido',    color: '#DC2626', tipo: 'perdido' },
]

/**
 * Colunas do kanban quando a empresa ainda não tem etapas no banco: o funil padrão.
 *
 * O funil com que cada preset nasce mora em presets_onboarding.etapas e é gravado em
 * funil_etapas no cadastro (lib/presets.ts, 29/10/2026); o dono ajusta em
 * Administração → Funil. Este fallback não sabe quem a empresa é.
 */
export function getKanbanColumns(): KanbanColumn[] {
  return KANBAN_COLUMNS
}

/** Id da etapa "ganho" (convertido/fechamento) do conjunto de colunas. */
export function ganhoColId(cols: KanbanColumn[]): string {
  return cols.find(c => c.tipo === 'ganho')?.id ?? 'convertido'
}
