/**
 * O FILTRO DA LISTA DE UMA TRANSMISSÃO (módulo Transmissão, 10/11/2026).
 *
 * É o embrião do módulo Públicos: a lista não é uma planilha colada, é uma regra sobre o
 * CRM ("quem está em Proposta há mais de 15 dias sem falar com a loja"). O banco resolve a
 * regra em `transmissao_publico` (migração 20261111000100); aqui só o formato, a limpeza
 * do que vem da tela e o texto que descreve a regra. Funções puras, testadas sozinhas.
 *
 * Etiqueta NÃO está aqui: o CRM não tem etiqueta hoje (nem tabela, nem campo). Ver o 06,
 * seção da Transmissão.
 */

export type Situacao = 'aberto' | 'ganho' | 'perdido'
export const SITUACOES: { id: Situacao; rotulo: string }[] = [
  { id: 'aberto', rotulo: 'Em aberto' },
  { id: 'ganho', rotulo: 'Ganho' },
  { id: 'perdido', rotulo: 'Perdido' },
]

export interface FiltroPublico {
  funil_id?: number
  etapa_ids?: number[]
  situacoes?: Situacao[]
  /** contatos.origem, comparado em minúsculas. */
  origens?: string[]
  /** A última mensagem da conversa na loja é mais antiga que N dias (ou nunca houve). */
  sem_mensagem_ha_dias?: number
  /** A última mensagem da conversa na loja é dos últimos N dias. */
  com_mensagem_nos_dias?: number
}

const MAX_DIAS = 3650
const inteiro = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return undefined
  return n
}
const ids = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const l = [...new Set(v.map((x) => inteiro(x, 1, Number.MAX_SAFE_INTEGER)).filter((x): x is number => x != null))]
  return l.length ? l : undefined
}

/** O que vem da tela, limpo: chave desconhecida sai, número fora da faixa sai, lista vazia sai. */
export function normalizarFiltro(bruto: unknown): FiltroPublico {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const f: FiltroPublico = {}
  const funil = inteiro(b.funil_id, 1, Number.MAX_SAFE_INTEGER)
  if (funil) f.funil_id = funil
  const etapas = ids(b.etapa_ids)
  if (etapas) f.etapa_ids = etapas
  if (Array.isArray(b.situacoes)) {
    const s = [...new Set(b.situacoes.filter((x): x is Situacao => SITUACOES.some((y) => y.id === x)))]
    if (s.length) f.situacoes = s
  }
  if (Array.isArray(b.origens)) {
    const o = [...new Set(b.origens.map((x) => String(x ?? '').trim().toLowerCase()).filter((x) => x && x.length <= 40))]
    if (o.length) f.origens = o
  }
  const sem = inteiro(b.sem_mensagem_ha_dias, 1, MAX_DIAS)
  if (sem) f.sem_mensagem_ha_dias = sem
  const com = inteiro(b.com_mensagem_nos_dias, 1, MAX_DIAS)
  if (com) f.com_mensagem_nos_dias = com
  return f
}

/** As duas faixas de "última mensagem" juntas só fazem sentido se deixarem algum intervalo. */
export function filtroImpossivel(f: FiltroPublico): string | null {
  if (f.sem_mensagem_ha_dias && f.com_mensagem_nos_dias && f.sem_mensagem_ha_dias >= f.com_mensagem_nos_dias) {
    return `"sem mensagem há ${f.sem_mensagem_ha_dias} dias" e "com mensagem nos últimos ${f.com_mensagem_nos_dias} dias" não deixam ninguém`
  }
  return null
}

export interface NomesDoFiltro {
  funis: Map<number, string>
  etapas: Map<number, string>
}

/** A regra em português, para a lista e para o acompanhamento. */
export function descreverFiltro(f: FiltroPublico, nomes: NomesDoFiltro): string {
  const partes: string[] = []
  if (f.funil_id) partes.push(`funil ${nomes.funis.get(f.funil_id) ?? `#${f.funil_id}`}`)
  if (f.etapa_ids?.length) partes.push(`etapa ${f.etapa_ids.map((id) => nomes.etapas.get(id) ?? `#${id}`).join(' ou ')}`)
  if (f.situacoes?.length) partes.push(f.situacoes.map((s) => SITUACOES.find((x) => x.id === s)?.rotulo.toLowerCase() ?? s).join(' ou '))
  if (f.origens?.length) partes.push(`origem ${f.origens.join(' ou ')}`)
  if (f.sem_mensagem_ha_dias) partes.push(`sem mensagem há mais de ${f.sem_mensagem_ha_dias} dias`)
  if (f.com_mensagem_nos_dias) partes.push(`com mensagem nos últimos ${f.com_mensagem_nos_dias} dias`)
  return partes.length ? partes.join(' · ') : 'todos os contatos da loja'
}

/** Variáveis do modelo ({{1}}, {{2}}…): quantas o corpo pede. */
export function variaveisDoModelo(corpo: string | null | undefined): number {
  const nums = [...(corpo ?? '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  return nums.length ? Math.max(...nums) : 0
}

/** O texto que fica na conversa: o corpo com as variáveis trocadas ({{nome}} = nome do contato). */
export function renderizar(corpo: string | null | undefined, parametros: string[], nome: string | null): { parametros: string[]; previa: string } {
  const p = parametros.map((x) => String(x ?? '').replace(/\{\{nome\}\}/g, nome ?? '').trim())
  const previa = (corpo ?? '').replace(/\{\{(\d+)\}\}/g, (_, n) => p[Number(n) - 1] ?? '')
  return { parametros: p, previa }
}

// ── O teto por hora (configurável por empresa) ───────────────────────────────
export const CHAVE_CONFIG = 'transmissao'
export const TETO_PADRAO = 50
export const TETO_MAX = 1000

export function tetoValido(v: unknown): number {
  const n = inteiro((v as { teto_hora?: unknown } | null)?.teto_hora, 1, TETO_MAX)
  return n ?? TETO_PADRAO
}
