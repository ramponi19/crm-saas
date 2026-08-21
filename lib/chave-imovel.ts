import { paraData } from '@/lib/datas'

/**
 * Onde está a chave de um imóvel — derivado das chaves cadastradas dele.
 *
 * Existia uma tela "Chaves" e, ao mesmo tempo, um campo de texto livre "Chaves" na
 * ficha do imóvel ("Ex: na imobiliária"). Duas verdades sobre a mesma chave, uma
 * digitada à mão: quem lesse a ficha e quem lesse a tela podiam discordar, e nenhum
 * dos dois estava errado. Agora a chave é ATRIBUTO do imóvel, calculado do cadastro
 * de chaves — o campo de texto saiu.
 *
 * Módulo neutro (sem React, sem banco): a lista de imóveis, o filtro e a ficha
 * respondem a mesma pergunta, e cada um calculando por conta própria é como se cria
 * divergência.
 */

export type EstadoChave = 'sem' | 'na_imobiliaria' | 'emprestada' | 'atrasada'

export interface ChaveMin {
  status: string
  com_quem?: string | null
  devolucao_prevista?: string | null
}

export const ESTADOS: { id: EstadoChave; label: string; tone: 'ok' | 'warn' | 'bad' | 'neutro' }[] = [
  { id: 'na_imobiliaria', label: 'Na imobiliária', tone: 'ok' },
  { id: 'emprestada',     label: 'Emprestada',     tone: 'warn' },
  { id: 'atrasada',       label: 'Atrasada',       tone: 'bad' },
  { id: 'sem',            label: 'Sem chave',      tone: 'neutro' },
]

export const rotuloEstado = (e: EstadoChave) => ESTADOS.find((x) => x.id === e) ?? ESTADOS[3]

/**
 * Atrasada é a que passou do dia — não a que VENCE hoje.
 *
 * A conta ingênua compara `new Date('2026-08-18')` (meia-noite UTC, que em Brasília
 * é 17/08 às 21h) com a meia-noite LOCAL: a chave aparecia atrasada no próprio dia
 * em que devia voltar, um dia antes da hora — e quem empresta chave cobra o corretor
 * por isso. Com as duas pontas no fuso local, o dia do vencimento ainda está em tempo.
 */
export function chaveAtrasada(c: ChaveMin): boolean {
  if (c.status !== 'emprestada') return false
  const prevista = paraData(c.devolucao_prevista ?? null)
  if (!prevista) return false
  const agora = new Date()
  return prevista < new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
}

/**
 * Estado do imóvel a partir das chaves dele.
 *
 * A pior notícia ganha: um imóvel com duas chaves, uma na loja e uma atrasada, está
 * com chave atrasada — é isso que alguém precisa resolver hoje.
 */
export function estadoDaChave(chaves: ChaveMin[]): EstadoChave {
  if (!chaves.length) return 'sem'
  if (chaves.some(chaveAtrasada)) return 'atrasada'
  if (chaves.some((c) => c.status === 'emprestada')) return 'emprestada'
  return 'na_imobiliaria'
}

/** Com quem está a chave, quando há uma emprestada. */
export function comQuemEsta(chaves: ChaveMin[]): string | null {
  const fora = chaves.find((c) => c.status === 'emprestada')
  return fora?.com_quem?.trim() || null
}
