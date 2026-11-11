/**
 * NÚMERO SÓ DE CONSULTA (10/11/2026).
 *
 * No smoke de 10/11 o Assistente escreveu "2.238 leads de Mogi Guaçu" sem ter
 * consultado nada — e se corrigiu sozinho na resposta seguinte. Pedido do
 * Lucas: o Assistente não pode afirmar contagem, valor ou percentual sem ter
 * chamado uma ferramenta na mesma resposta.
 *
 * Esta é a régua que o chat usa para saber se uma resposta SEM consulta está
 * afirmando número. Pega o que é afirmação de quantidade — "240 leads",
 * "R$ 89,6 mil", "33%", "1.544 mensagens" — e deixa passar o que não é:
 * datas (13/10), horas (11h, 11:30), modelos de aparelho (17 Pro Max),
 * parcelas (18x) e passos numerados.
 */

const UNIDADES = [
  'leads?', 'vendas?', 'conversas?', 'clientes?', 'mensagens?', 'contatos?', 'neg[oó]cios?', 'pedidos?',
  'itens', 'unidades', 'an[aá]lises?', 'pessoas', 'atendimentos?', 'or[cç]amentos?', 'encomendas?',
  'compras?', 'perdidos?', 'convertidos?', 'aparelhos?', 'produtos?', 'cart[oõ]es', 'fichas?',
].join('|')

const PADROES: RegExp[] = [
  // dinheiro: "R$ 5.700", "R$89,6 mil"
  /R\$\s?\d[\d.,]*(?:\s?(?:mil|milh[õo]es|mi))?/gi,
  // percentual: "33%", "8,5 %"
  /\d+(?:[.,]\d+)?\s?%/g,
  // contagem: "240 leads", "1.544 mensagens", "6 leads novos", "3 novas conversas"
  new RegExp(`(?<![\\d/:,.])\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?\\s+(?:(?:novos?|novas?|leads?)\\s+)?(?:${UNIDADES})\\b`, 'gi'),
  // "89,6 mil", "12 mil" (valor ou quantidade por extenso)
  /(?<![\d/:])\d+(?:[.,]\d+)?\s?mil\b/gi,
]

/** Os trechos do texto que afirmam contagem, valor ou percentual. */
export function numerosAfirmados(texto: string): string[] {
  const achados: string[] = []
  for (const p of PADROES) for (const m of texto.matchAll(p)) achados.push(m[0].trim())
  return [...new Set(achados)]
}

/** Troca cada número afirmado por um aviso — último recurso, quando o modelo insiste sem consultar. */
export function semNumeros(texto: string): string {
  let t = texto
  for (const p of PADROES) t = t.replace(p, '[número não consultado]')
  return t
}

/** O que o chat diz ao modelo quando ele responde com número sem ter consultado. */
export const AVISO_SEM_CONSULTA = '[verificação automática do sistema, não do usuário] Sua resposta afirma contagem, valor ou '
  + 'percentual sem ter chamado nenhuma ferramenta nesta resposta. Número só pode vir de consulta feita agora. '
  + 'Consulte a ferramenta certa e responda com o que ela trouxer, ou responda de novo sem números.'
