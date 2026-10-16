/**
 * O QUE A TELA DO ZAPINTEL DIZ QUANDO ALGO FALHA — e o que ela nunca diz.
 *
 * Até 16/10/2026 as telas repassavam o erro cru: com a rede fora, a lista
 * mostrava "TypeError: Failed to fetch (guiuzbcqkvelqcuogxtd.supabase.co)", e
 * o timeout do Postgres aparecia em inglês ("canceling statement due to
 * statement timeout"). Quem lê é um vendedor no balcão: o texto técnico não
 * diz o que fazer e ainda expõe o identificador do projeto.
 *
 * Regra: **nunca** sai para a tela um TypeError, uma URL do Supabase ou texto
 * do Postgres. O cru continua no console do navegador e no log do servidor,
 * onde serve para diagnosticar.
 *
 * Sem dependência de React nem de servidor: as telas e os testes usam igual.
 */

export const TEXTOS_DE_ERRO = {
  semConexao: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  demorou: 'A consulta demorou demais. Tente de novo em instantes.',
  erroAoCarregar: 'Erro ao carregar. Tente de novo.',
  semAcessoLoja: 'Esta loja não está no seu acesso. Escolha "Toda a rede" ou a sua loja no menu.',
  semAcesso: 'Você não tem acesso a estes dados.',
  // Ficha do lead, por status da rota (pedido do Lucas em 17/10/2026).
  leadSemAcesso: 'Você não tem acesso a este lead.',
  leadNaoEncontrado: 'Lead não encontrado.',
  leadErro: 'Erro ao carregar; tente novamente.',
  limitePorHora: 'Você atingiu o limite de análises desta hora. Tente de novo mais tarde.',
} as const

/** É o tipo de texto que não pode ir para a tela? */
export function ehTextoTecnico(t: string): boolean {
  return /TypeError|Failed to fetch|NetworkError|Load failed|fetch failed|supabase\.co|https?:\/\/|canceling statement|statement timeout|violates|relation "|column "|function |syntax error|permission denied|JWT|PGRST|\b\d{5}\b|\bat [A-Za-z_$][\w$]*\s*\(/i.test(t)
}

/**
 * Erro de consulta das telas (RPC do Supabase, ou a exceção do `fetch`) para
 * uma frase que orienta.
 */
export function mensagemDeErroDeTela(erro: unknown): string {
  const t = erro instanceof Error ? erro.message : String(erro ?? '')
  if (/loja fora/i.test(t)) return TEXTOS_DE_ERRO.semAcessoLoja
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(t)) return TEXTOS_DE_ERRO.semConexao
  if (/statement timeout|canceling statement|57014|timeout|demorou/i.test(t)) return TEXTOS_DE_ERRO.demorou
  if (/42501|permission denied|restrito|sem acesso/i.test(t)) return TEXTOS_DE_ERRO.semAcesso
  return TEXTOS_DE_ERRO.erroAoCarregar
}

/**
 * Resposta de uma rota do ZapIntel para a frase da ficha do lead.
 *
 * As rotas já devolvem frases em português no campo `erro` (o 503 de modelo
 * não configurado, o 504 de "demorou demais", o 422 de funil interno). Essas
 * passam como estão — desde que não sejam texto técnico. O resto cai na frase
 * do status.
 */
export function mensagemPorStatus(status: number, erroDoServidor?: unknown): string {
  const doServidor = typeof erroDoServidor === 'string' ? erroDoServidor.trim() : ''
  if (status === 403) return TEXTOS_DE_ERRO.leadSemAcesso
  if (status === 404) return TEXTOS_DE_ERRO.leadNaoEncontrado
  if (status === 429) return doServidor && !ehTextoTecnico(doServidor) ? doServidor : TEXTOS_DE_ERRO.limitePorHora
  if (doServidor && !ehTextoTecnico(doServidor)) return doServidor
  return TEXTOS_DE_ERRO.leadErro
}
