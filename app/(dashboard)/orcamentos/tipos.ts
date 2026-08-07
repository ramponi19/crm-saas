/**
 * Tipos do orçamento, fora da view.
 *
 * Ficavam em orcamentos-view.tsx, mas o editor virou componente próprio
 * (usado também dentro do chat do lead) e a view passou a importá-lo: manter os
 * tipos lá deixaria os dois arquivos se importando em círculo.
 */

export interface ItemOrc { descricao: string; qtd: number; valor: number }

export interface Orcamento {
  id: number; lead_id: number | null; tipo: string; status: string; cliente_nome: string; cliente_telefone: string | null
  aparelho: string | null; imei: string | null; defeito: string | null; prazo_dias: number | null; garantia_dias: number | null
  itens: ItemOrc[]; aparelho_novo: string | null; valor_novo: number | null; aparelho_usado: string | null; valor_entrada: number | null
  unidade_id: number | null; total: number; valor_devolver: number | null; acerto: string | null
  observacoes: string | null; token: string; created_at: string | null
}

export interface UnidadeOpt { id: number; label: string; preco: number }

export interface PrecoRef { modelo: string; armazenamento: string | null; condicao: string; preco_sugerido: number }
