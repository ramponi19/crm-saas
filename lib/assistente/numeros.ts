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
  // Um trecho por lugar do texto: "R$ 95 mil" não conta de novo como "95 mil".
  const achados: { ini: number; fim: number; t: string }[] = []
  for (const p of PADROES) {
    for (const m of texto.matchAll(p)) {
      const ini = m.index ?? 0, fim = ini + m[0].length
      if (achados.some((a) => ini < a.fim && fim > a.ini)) continue
      achados.push({ ini, fim, t: m[0].trim() })
    }
  }
  return [...new Set(achados.sort((a, b) => a.ini - b.ini).map((a) => a.t))]
}

/** Troca cada número afirmado por um aviso — último recurso, quando o modelo insiste sem consultar. */
export function semNumeros(texto: string): string {
  let t = texto
  for (const p of PADROES) t = t.replace(p, '[número não consultado]')
  return t
}

// ── FUNDAMENTO (11/11/2026) ──────────────────────────────────────────────────
//
// Consultar não basta: no smoke de 10/11 o "2.238 leads" veio DEPOIS de uma
// busca que não trazia esse número. Pedido do Lucas: todo número de contagem,
// valor ou percentual da resposta final tem de aparecer nos resultados das
// ferramentas daquela resposta, ou ser soma direta deles.

/** "2.238" → 2238; "89,6" → 89.6; "2.5" → 2.5. Devolve também quantas casas decimais o texto mostra. */
function numeroBr(t: string): { v: number; casas: number } | null {
  const s = t.trim()
  if (!s) return null
  if (s.includes(',')) {
    const [int, dec] = s.split(',')
    const v = Number(`${int.replace(/\./g, '')}.${dec}`)
    return Number.isFinite(v) ? { v, casas: dec.length } : null
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return { v: Number(s.replace(/\./g, '')), casas: 0 }
  const v = Number(s)
  return Number.isFinite(v) ? { v, casas: s.includes('.') ? s.split('.')[1].length : 0 } : null
}

export interface Afirmado {
  trecho: string
  valor: number
  tolerancia: number
  /** É percentual ("33%", "8,5 %") — o único que pode vir da divisão de dois números. */
  percentual: boolean
  /** Casas decimais que o texto mostra. */
  casas: number
}

/** Cada número afirmado com o valor e a tolerância do arredondamento que o texto mostra. */
export function valoresAfirmados(texto: string): Afirmado[] {
  const out: Afirmado[] = []
  for (const trecho of numerosAfirmados(texto)) {
    const m = trecho.match(/\d[\d.,]*/)
    const n = m ? numeroBr(m[0].replace(/[.,]$/, '')) : null
    if (!n) continue
    const mult = /milh[õo]es|\bmi\b/i.test(trecho) ? 1_000_000 : /\bmil\b/i.test(trecho) ? 1_000 : 1
    out.push({
      trecho, valor: n.v * mult, tolerancia: Math.max(0.005, 0.5 * 10 ** -n.casas * mult),
      percentual: trecho.includes('%'), casas: n.casas,
    })
  }
  return out
}

const TETO_NUMEROS = 400
/** Teto da lista de quantidades usadas na divisão (pares = teto²). */
const TETO_RAZAO = 200

interface Colheita {
  /** Tudo o que aparece nos resultados (inclusive números dentro de textos). */
  todos: number[]
  /**
   * Só quantidades: campos numéricos que não são identificador, tamanho de
   * lista, soma de um campo, contagem de campo=valor. É daqui que sai a
   * divisão do percentual — números soltos de texto (datas, telefones, ids)
   * dariam razão para qualquer percentual e a checagem perderia o dente.
   */
  quantidades: number[]
}

const ehIdentificador = (k: string) => /^id$|_id$|^id_|telefone|phone|cpf|cnpj|cep/i.test(k)

function colher(resultados: string[]): Colheita {
  const todos: number[] = []
  const quantidades: number[] = []
  const add = (v: number, qtd: boolean) => {
    if (!Number.isFinite(v)) return
    todos.push(v)
    if (qtd) quantidades.push(v)
  }
  const doTexto = (s: string) => {
    for (const m of s.matchAll(/\d[\d.,]*\d|\d/g)) { const n = numeroBr(m[0]); if (n) add(n.v, false) }
  }
  const andar = (x: unknown, chave: string): void => {
    if (typeof x === 'number') return add(x, !ehIdentificador(chave))
    if (typeof x === 'string') return doTexto(x)
    if (Array.isArray(x)) {
      add(x.length, true)
      const objs = x.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i))
      if (objs.length) {
        const somas = new Map<string, number>()
        const contagens = new Map<string, number>()
        const contar = (prefixo: string, o: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(o)) {
            if (typeof v === 'number') { if (!ehIdentificador(k)) somas.set(prefixo + k, (somas.get(prefixo + k) ?? 0) + v) }
            else if (typeof v === 'boolean' || typeof v === 'string') {
              const ch = `${prefixo}${k}=${v}`
              contagens.set(ch, (contagens.get(ch) ?? 0) + 1)
            } else if (v && typeof v === 'object' && !Array.isArray(v) && !prefixo) contar(`${k}.`, v as Record<string, unknown>)
          }
        }
        for (const o of objs) contar('', o)
        for (const v of somas.values()) add(v, true)
        for (const v of contagens.values()) add(v, true)
      }
      for (const i of x) andar(i, chave)
      return
    }
    if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) andar(v, k)
  }
  for (const r of resultados) {
    try { andar(JSON.parse(r), '') } catch { doTexto(r) }
  }
  return { todos: [...new Set(todos)], quantidades: [...new Set(quantidades)] }
}

/**
 * Os números que as ferramentas devolveram nesta resposta — e o que sai deles
 * sem conta do modelo: tamanho de lista, soma de um campo numa lista, quantos
 * itens de uma lista têm um campo com um valor (ex.: esperando_loja = true), e
 * somas diretas de dois deles.
 */
export function numerosDasFerramentas(resultados: string[]): number[] {
  const base = colher(resultados).todos.slice(0, TETO_NUMEROS)
  const comSomas = new Set(base)
  for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) comSomas.add(base[i] + base[j])
  return [...comSomas]
}

/**
 * Percentual calculado (11/11/2026, pedido do Lucas): "33%" passa se for a
 * divisão de duas quantidades dos resultados (a ÷ b × 100), arredondada para
 * inteiro ou uma casa — do jeito que o texto mostra. Mais casas que isso não
 * passa por divisão (só se o número estiver escrito no resultado).
 */
function percentualPorDivisao(a: Afirmado, quantidades: number[]): boolean {
  if (!a.percentual || a.casas > 1) return false
  const q = quantidades.filter((n) => n >= 0).slice(0, TETO_RAZAO)
  for (const den of q) {
    if (den <= 0) continue
    for (const num of q) {
      const p = (num / den) * 100
      if (Math.abs(Number(p.toFixed(a.casas)) - a.valor) < 1e-9) return true
    }
  }
  return false
}

/** Os trechos da resposta cujo número não aparece nos resultados (nem como soma direta, nem como percentual de dois deles). */
export function semFundamento(texto: string, resultados: string[]): string[] {
  const afirmados = valoresAfirmados(texto)
  if (!afirmados.length) return []
  const base = numerosDasFerramentas(resultados)
  let quantidades: number[] | null = null
  return afirmados
    .filter((a) => {
      if (base.some((n) => Math.abs(n - a.valor) <= a.tolerancia)) return false
      if (a.percentual) {
        quantidades ??= colher(resultados).quantidades
        if (percentualPorDivisao(a, quantidades)) return false
      }
      return true
    })
    .map((a) => a.trecho)
}

/** Troca só os trechos sem fundamento. */
export function trocarTrechos(texto: string, trechos: string[]): string {
  let t = texto
  for (const tr of [...trechos].sort((a, b) => b.length - a.length)) t = t.split(tr).join('[número não consultado]')
  return t
}

/** O que o chat diz ao modelo quando um número da resposta não está nos resultados das ferramentas. */
export const avisoSemFundamento = (trechos: string[]) =>
  '[verificação automática do sistema, não do usuário] Estes números da sua resposta não aparecem nos resultados '
  + `das ferramentas desta resposta, nem como soma direta deles, nem como percentual (inteiro ou uma casa) da divisão de dois deles: ${trechos.slice(0, 8).join('; ')}. `
  + 'Refaça a resposta usando só números que as ferramentas trouxeram — consulte de novo se precisar — ou retire o número.'

/** O que o chat diz ao modelo quando ele responde com número sem ter consultado. */
export const AVISO_SEM_CONSULTA = '[verificação automática do sistema, não do usuário] Sua resposta afirma contagem, valor ou '
  + 'percentual sem ter chamado nenhuma ferramenta nesta resposta. Número só pode vir de consulta feita agora. '
  + 'Consulte a ferramenta certa e responda com o que ela trouxer, ou responda de novo sem números.'
