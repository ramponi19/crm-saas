/**
 * CUSTO PROTEGIDO NO APP (etapa 1.1e, tempo 2; docs/etapa-1.1-plano.md §4.4).
 *
 * O custo mora nos satélites (estoque_unidades_custos, vendas_vendas_custos, compras_pedidos_custos), que só quem tem
 * `estoque.ver_custo` lê (RLS). O app NÃO lê nem grava as colunas antigas (preco_custo, custo_reparo, valor_custo,
 * lucro, valor_total): scripts/check-custo.mjs reprova. Quem não tem a permissão nem pede a junção (o servidor não lê):
 * as telas recebem `null` e escondem custo, lucro e margem.
 *
 * Uma fórmula de margem só (antes eram duas, no estoque-view e no unidade-modal): margem sobre o PREÇO DE VENDA,
 * com custo pendente (nulo) = margem desconhecida (nulo), nunca 100%.
 */

/**
 * Colunas de `estoque_unidades` que o app lê, SEM as de custo (preco_custo, custo_reparo). Lista explícita em vez de
 * `*`: o `*` traria a coluna antiga, que fica nula na 1.1f e sai na 1.1g.
 */
// lista de NOMES DE COLUNA (sem espaço: não é texto para a loja ler)
export const COLUNAS_UNIDADE = [
  'id', 'produto_id', 'imei', 'imei2', 'numero_serie', 'bateria', 'condicao', 'cor', 'armazenamento', 'preco_venda',
  'fornecedor_id', 'observacoes', 'status', 'usuario_id', 'ativo', 'created_at', 'anatel_resultado', 'tipo',
  'estado', 'cliente_id', 'fotos_urls', 'empresa_id', 'placa', 'chassi', 'renavam', 'km', 'ano', 'reservado_lead_id',
  'reservado_por', 'reservado_em', 'reserva_expira_em', 'grupo_pdv', 'recebido_em', 'recebido_por', 'quantidade',
  'filial_id',
].join(',')

/** Junções do PostgREST: o satélite vem como objeto (a PK é a FK, relação 1:1). */
export const JUNCAO_CUSTO_UNIDADE = 'custo:estoque_unidades_custos(preco_custo, custo_reparo, custo_origem)'
export const JUNCAO_CUSTO_VENDA = 'custo:vendas_vendas_custos(valor_custo, custo_preenchido_em)'
export const JUNCAO_CUSTO_COMPRA = 'custo:compras_pedidos_custos(valor_total)'

type Embed<T> = T | T[] | null | undefined
const um = <T>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r ?? null)
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export interface CustoUnidade { preco_custo: number | null; custo_reparo: number | null; custo_origem: string | null }

/** Custo da unidade a partir da junção; `null` sem a permissão (a junção vem nula) ou sem a junção. */
export function custoDaUnidade(linha: { custo?: Embed<{ preco_custo?: unknown; custo_reparo?: unknown; custo_origem?: unknown }> }): CustoUnidade | null {
  const c = um(linha.custo)
  if (!c) return null
  return { preco_custo: num(c.preco_custo), custo_reparo: num(c.custo_reparo), custo_origem: (c.custo_origem as string | null) ?? null }
}

/** Custo da venda a partir da junção; `null` = sem permissão OU custo pendente (as duas escondem o lucro). */
export function custoDaVenda(linha: { custo?: Embed<{ valor_custo?: unknown }> }): number | null {
  return num(um(linha.custo)?.valor_custo)
}

export function valorDaCompra(linha: { custo?: Embed<{ valor_total?: unknown }> }): number | null {
  return num(um(linha.custo)?.valor_total)
}

/** Custo total da unidade (custo + reparo). Pendente → null. */
export function custoTotal(c: Pick<CustoUnidade, 'preco_custo' | 'custo_reparo'> | null): number | null {
  if (!c || c.preco_custo === null) return null
  return c.preco_custo + (c.custo_reparo ?? 0)
}

/** Lucro = venda − custo. Custo nulo (pendente ou sem permissão) → null. */
export function lucro(valorVenda: number | null | undefined, custo: number | null | undefined): number | null {
  if (custo === null || custo === undefined || valorVenda === null || valorVenda === undefined) return null
  return Number(valorVenda) - Number(custo)
}

/**
 * Margem em % sobre o PREÇO DE VENDA, com 1 casa. Custo nulo ou venda sem valor → null ("margem desconhecida").
 * A mesma conta do banco (vendas_resultado).
 */
export function margem(valorVenda: number | null | undefined, custo: number | null | undefined): number | null {
  const l = lucro(valorVenda, custo)
  if (l === null || !valorVenda) return null
  return Math.round((l / Number(valorVenda)) * 1000) / 10
}
