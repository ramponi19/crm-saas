/**
 * Match de veículos — cruza o INTERESSE de compra de um lead com o ESTOQUE
 * de veículos da loja (segmento "concessionaria").
 * Critérios (filtros eliminatórios + pontuação para ranking):
 *  - categoria (carro, moto, caminhão…) igual à desejada
 *  - marca entre as desejadas
 *  - modelo contém o texto buscado
 *  - ano dentro de [ano_min, ano_max]
 *  - preço <= preco_max (tolerância +10%)
 *  - km <= km_max
 * Espelha a ideia do match imobiliário (lib/match-imoveis.ts), mas com
 * critérios próprios — sem abstração forçada entre os dois.
 */

export interface InteresseVeiculo {
  categoria: string | null
  marca: string | null
  modelo: string | null
  ano_min: number | null
  ano_max: number | null
  preco_max: number | null
  km_max: number | null
}

export interface VeiculoMatchInput {
  id: number
  produto_nome: string | null
  marca_nome: string | null
  categoria_nome: string | null
  ano: number | null
  km: number | null
  cor: string | null
  preco_venda: number | null
  status: string | null
}

export interface MatchVeiculo {
  veiculo: VeiculoMatchInput
  score: number
}

const low = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Pontua um veículo contra o interesse. Retorna null se eliminado por algum critério. */
export function pontuarVeiculo(interesse: InteresseVeiculo, v: VeiculoMatchInput): number | null {
  let score = 0

  // categoria (eliminatório se especificada)
  if (low(interesse.categoria)) {
    if (low(interesse.categoria) !== low(v.categoria_nome)) return null
    score += 22
  }

  // marca (eliminatório se especificada)
  if (low(interesse.marca)) {
    if (low(interesse.marca) !== low(v.marca_nome)) return null
    score += 26
  }

  // modelo: match por conteúdo (eliminatório se especificado)
  if (low(interesse.modelo)) {
    if (!low(v.produto_nome).includes(low(interesse.modelo))) return null
    score += 24
  }

  // ano dentro da faixa (eliminatório se a faixa é definida)
  if (interesse.ano_min != null || interesse.ano_max != null) {
    if (v.ano == null) return null
    if (interesse.ano_min != null && v.ano < interesse.ano_min) return null
    if (interesse.ano_max != null && v.ano > interesse.ano_max) return null
    score += 12
  }

  // preço (tolerância de +10% no teto)
  if (interesse.preco_max != null) {
    if (v.preco_venda == null) return null
    if (v.preco_venda > interesse.preco_max * 1.1) return null
    score += 12
    if (v.preco_venda <= interesse.preco_max) score += 4 // bônus por estar dentro do teto
  }

  // km máximo (eliminatório se definido)
  if (interesse.km_max != null) {
    if ((v.km ?? 0) > interesse.km_max) return null
    score += 8
  }

  // sem nenhum critério → match fraco de base
  return score === 0 ? 40 : Math.min(100, score)
}

/** Ranqueia veículos disponíveis compatíveis com o interesse (maior score primeiro). */
export function ranquearVeiculos(interesse: InteresseVeiculo, veiculos: VeiculoMatchInput[]): MatchVeiculo[] {
  const out: MatchVeiculo[] = []
  for (const v of veiculos) {
    if (v.status && v.status !== 'disponivel') continue
    const score = pontuarVeiculo(interesse, v)
    if (score != null) out.push({ veiculo: v, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** true se o interesse tem ao menos um critério preenchido. */
export function interesseVeiculoPreenchido(i: InteresseVeiculo): boolean {
  return !!(low(i.categoria) || low(i.marca) || low(i.modelo) ||
    i.ano_min != null || i.ano_max != null || i.preco_max != null || i.km_max != null)
}
