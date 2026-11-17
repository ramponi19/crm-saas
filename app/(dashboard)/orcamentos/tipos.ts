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
  cliente_id: number | null
  aparelho: string | null; imei: string | null; defeito: string | null; prazo_dias: number | null; garantia_dias: number | null
  itens: ItemOrc[]; aparelho_novo: string | null; valor_novo: number | null; aparelho_usado: string | null; valor_entrada: number | null
  unidade_id: number | null; total: number; valor_devolver: number | null; acerto: string | null
  observacoes: string | null; token: string; created_at: string | null
}

export interface UnidadeOpt { id: number; label: string; preco: number }

export interface PrecoRef { modelo: string; armazenamento: string | null; condicao: string; preco_sugerido: number }

/**
 * OS RÓTULOS DO ORÇAMENTO (17/11/2026, "o core é genérico"): o orçamento fala de "item" e de "nº de
 * série". Com o módulo Celulares e aparelhos (`celulares`) ligado, fala de aparelho e IMEI — esses
 * textos moram em components/modules/celulares/orcamento-rotulos.ts. As colunas do banco
 * (`aparelho`, `imei`, `aparelho_novo`…) continuam com o nome de sempre.
 */
export interface RotulosOrcamento {
  /** O item do conserto ou da venda. */
  item: string
  /** Campo de série no editor. */
  serie: string
  /** Série na página do cliente. */
  serieCurta: string
  /** Upgrade/Downgrade: o que o cliente leva… */
  itemNovo: string
  itemNovoExemplo: string
  /** …e o que ele entrega. */
  itemEntrada: string
  itemEntradaExemplo: string
  /** Na página do cliente, quando a entrada não tem descrição. */
  entradaDoCliente: string
  /** "O item do cliente vale R$ X mais que o que ele leva." */
  entradaValeMais: string
  itemDoEstoque: string
  descricaoVenda: string
  /** Defeito da OS aberta por um orçamento de melhoria sem descrição. */
  melhoria: string
  /** A unidade do estoque sem cadastro de produto. */
  unidadeSemProduto: string
}

export const ROTULOS_ORCAMENTO: RotulosOrcamento = {
  item: 'Item',
  serie: 'Nº de série (opcional)',
  serieCurta: 'Nº de série',
  itemNovo: 'Item novo',
  itemNovoExemplo: 'Modelo / versão',
  itemEntrada: 'Item do cliente (entrada)',
  itemEntradaExemplo: 'Modelo / versão',
  entradaDoCliente: 'seu item',
  entradaValeMais: 'O item do cliente vale',
  itemDoEstoque: 'Item do estoque (baixa ao aprovar)',
  descricaoVenda: 'Descrição do item',
  melhoria: 'Upgrade/melhoria',
  unidadeSemProduto: 'Item',
}
