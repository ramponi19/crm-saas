/**
 * Match imobiliário — cruza o PERFIL DE BUSCA de um lead com os IMÓVEIS.
 * Critérios (com filtros eliminatórios + pontuação para ranking):
 *  - tipo do imóvel entre os tipos desejados
 *  - localização (bairro OU cidade entre os desejados)
 *  - preço dentro de [min, max] com tolerância de +10% no teto
 *  - quartos e vagas do imóvel >= mínimo exigido
 * Retorna lista ordenada por pontuação (maior = mais relevante).
 */

export interface PerfilBusca {
  finalidade: string | null
  tipos: string[]
  cidades: string[]
  bairros: string[]
  preco_min: number | null
  preco_max: number | null
  quartos_min: number | null
  vagas_min: number | null
}

export interface ImovelMatchInput {
  id: number
  codigo: string | null
  titulo: string | null
  tipo: string
  finalidade: string
  status: string
  bairro: string | null
  cidade: string | null
  valor_venda: number | null
  valor_locacao: number | null
  quartos: number | null
  vagas: number | null
}

export interface MatchResultado {
  imovel: ImovelMatchInput
  score: number
}

const low = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Pontua um imóvel contra um perfil. Retorna null se for eliminado por algum critério. */
export function pontuar(perfil: PerfilBusca, im: ImovelMatchInput): number | null {
  let score = 0

  // tipo (eliminatório se o perfil restringe tipos)
  if (perfil.tipos.length > 0) {
    if (!perfil.tipos.includes(im.tipo)) return null
    score += 25
  }

  // localização: bairro OU cidade (eliminatório se o perfil especifica)
  if (perfil.bairros.length > 0 || perfil.cidades.length > 0) {
    const bairroOk = perfil.bairros.some(b => low(b) === low(im.bairro))
    const cidadeOk = perfil.cidades.some(c => low(c) === low(im.cidade))
    if (!bairroOk && !cidadeOk) return null
    score += bairroOk ? 30 : 18 // bairro exato vale mais
  }

  // preço (usa venda ou locação conforme a finalidade do perfil)
  const preco = perfil.finalidade === 'locacao' ? im.valor_locacao : im.valor_venda
  if (perfil.preco_min != null || perfil.preco_max != null) {
    if (preco == null) return null
    if (perfil.preco_min != null && preco < perfil.preco_min) return null
    if (perfil.preco_max != null && preco > perfil.preco_max * 1.1) return null
    score += 25
    // bônus por estar bem dentro da faixa (não estourando a tolerância)
    if (perfil.preco_max != null && preco <= perfil.preco_max) score += 5
  }

  // quartos e vagas (eliminatório: imóvel deve ter >= mínimo exigido)
  if (perfil.quartos_min != null) {
    if ((im.quartos ?? 0) < perfil.quartos_min) return null
    score += 10
  }
  if (perfil.vagas_min != null) {
    if ((im.vagas ?? 0) < perfil.vagas_min) return null
    score += 8
  }

  // sem nenhum critério definido → match fraco de base
  return score === 0 ? 40 : Math.min(100, score)
}

/** Ranqueia imóveis compatíveis com o perfil (maior score primeiro). */
export function ranquear(perfil: PerfilBusca, imoveis: ImovelMatchInput[]): MatchResultado[] {
  const out: MatchResultado[] = []
  for (const im of imoveis) {
    if (im.status !== 'disponivel') continue
    const score = pontuar(perfil, im)
    if (score != null) out.push({ imovel: im, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** true se o perfil tem ao menos um critério preenchido. */
export function perfilPreenchido(p: PerfilBusca): boolean {
  return p.tipos.length > 0 || p.cidades.length > 0 || p.bairros.length > 0 ||
    p.preco_min != null || p.preco_max != null || p.quartos_min != null || p.vagas_min != null
}
