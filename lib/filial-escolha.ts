/**
 * A loja escolhida no corpo de POST /api/filial/selecionar.
 *
 * O corpo é `{ filialId: número da loja | null }`, sempre com a chave — é o que o
 * seletor de loja e a tela de leads mandam (`null` = "Rede", todas as lojas).
 * Devolve `undefined` para pedido mal formado (corpo vazio, `null`, JSON quebrado,
 * chave ausente, id que não é inteiro positivo), que a rota responde com 400.
 * Antes, `null` derrubava a desestruturação em 500 e `{}` caía calado em "Rede"
 * (03/11/2026).
 */
export function filialEscolhida(corpo: unknown): number | null | undefined {
  if (!corpo || typeof corpo !== 'object' || !('filialId' in corpo)) return undefined
  const id = (corpo as { filialId: unknown }).filialId
  if (id === null) return null
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : undefined
}
