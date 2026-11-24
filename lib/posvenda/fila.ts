/**
 * A FILA DO PÓS-VENDA (C7 bloco 2, 24/11/2026) — regras puras, usadas pela página e pelos testes.
 * docs/design-pos-venda.md §2.5.2. Universal: nada de régua, texto ou loja de uma empresa aqui; o texto da mensagem é
 * o roteiro do passo (configuração da empresa), com as variáveis trocadas.
 */
import { diasEntre } from '@/lib/datas'

export type GrupoFila = 'atrasados' | 'hoje' | 'proximos'
export type TipoAcao = 'whatsapp' | 'ligacao' | 'pesquisa' | 'tarefa_interna'

export interface ItemPosVenda {
  id: number
  negocioId: number | null
  /** Dia previsto no fuso da empresa (YYYY-MM-DD). */
  previsto: string
  grupo: GrupoFila
  /** Dias de atraso (0 se não está atrasado). */
  atraso: number
  cliente: string
  telefone: string | null
  /** O que a pessoa comprou (produto do negócio; senão a categoria da venda), com a condição. */
  produto: string | null
  /** Dias desde a venda (null sem data). */
  diasDaVenda: number | null
  passo: string
  tipo: TipoAcao
  mensagem: string
  regua: string | null
  responsavelId: string
  responsavel: string | null
  loja: string | null
  tentativas: number
}

/** Atrasado (antes de hoje), hoje, ou nos próximos dias. */
export function grupoDoDia(previsto: string, hoje: string): GrupoFila {
  if (previsto < hoje) return 'atrasados'
  if (previsto === hoje) return 'hoje'
  return 'proximos'
}

/**
 * "D+7 Experiência": o dia do passo na frente do título. Se o título já começa com o dia ("D+7 …"), não repete.
 */
export function rotuloDoPasso(diaOffset: number | null | undefined, titulo: string): string {
  const t = (titulo ?? '').trim()
  if (diaOffset == null || /^D\s*\+\s*\d+/i.test(t)) return t
  return `D+${diaOffset} ${t}`.trim()
}

/** Primeiro nome, para a mensagem ("Ana Paula Souza" → "Ana"). */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

export interface VariaveisMensagem {
  nome?: string | null
  produto?: string | null
  loja?: string | null
  vendedor?: string | null
}

/**
 * O roteiro do passo com as variáveis trocadas: {{nome}} (primeiro nome), {{produto}}, {{loja}}, {{vendedor}}.
 * Variável sem valor some sem deixar espaço duplo; variável desconhecida fica como está (a empresa vê e corrige).
 */
export function montarMensagem(roteiro: string | null | undefined, v: VariaveisMensagem): string {
  const valores: Record<string, string> = {
    nome: primeiroNome(v.nome),
    produto: (v.produto ?? '').trim(),
    loja: (v.loja ?? '').trim(),
    vendedor: primeiroNome(v.vendedor),
  }
  return (roteiro ?? '')
    .replace(/\{\{\s*(nome|produto|loja|vendedor)\s*\}\}/gi, (_, k: string) => valores[k.toLowerCase()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.!?])/g, '$1')
    .trim()
}

/** "iPhone 15 Pro · Seminovo": o produto (ou a categoria) e a condição, como a empresa chama. */
export function descricaoDaCompra(produto: string | null | undefined, categoria: string | null | undefined,
                                  condicao: string | null | undefined, rotuloUsado = 'Usado'): string | null {
  const nome = (produto ?? '').trim() || (categoria ?? '').trim()
  const cond = condicao === 'seminovo' ? rotuloUsado : condicao === 'novo' ? 'Novo' : ''
  const partes = [nome, cond].filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}

/** Dias inteiros entre a venda e hoje (no fuso da empresa); null sem data. */
export function diasDesdeAVenda(diaVenda: string | null | undefined, hoje: string): number | null {
  if (!diaVenda || !/^\d{4}-\d{2}-\d{2}$/.test(diaVenda)) return null
  return Math.max(0, diasEntre(diaVenda, hoje))
}

/** "hoje", "1 dia", "12 dias". */
export function textoDias(n: number): string {
  if (n === 0) return 'hoje'
  return n === 1 ? '1 dia' : `${n} dias`
}

/**
 * Ordem da fila: atrasados primeiro (o mais antigo no topo), depois hoje e os próximos, pela data. No mesmo dia fica a
 * ordem de chegada (a consulta já vem pela hora prevista; o sort é estável).
 */
export function ordenarFila<T extends { grupo: GrupoFila; previsto: string }>(itens: T[]): T[] {
  const peso: Record<GrupoFila, number> = { atrasados: 0, hoje: 1, proximos: 2 }
  return [...itens].sort((a, b) => peso[a.grupo] - peso[b.grupo] || a.previsto.localeCompare(b.previsto))
}
