/**
 * CONFIGURAÇÕES › PÓS-VENDA (C7 bloco 3, 24/11/2026) — regras puras (tela, rota e testes).
 * Universal: nenhuma régua, texto ou valor de empresa aqui. A régua de cada empresa é dado dela.
 */

/** Categorias de modelo da Meta que o pós-venda conhece. */
export const CATEGORIAS_MODELO = ['UTILITY', 'MARKETING'] as const
export type CategoriaModelo = (typeof CATEGORIAS_MODELO)[number]
export const ROTULO_CATEGORIA: Record<string, string> = { UTILITY: 'Utilidade', MARKETING: 'Marketing', AUTHENTICATION: 'Autenticação' }

/**
 * Quais categorias de modelo o pós-venda pode usar (revisão da D8, 24/11/2026): por empresa, chave
 * `posvenda.categorias_modelo`. Sem a chave (padrão de instalação): só Utilidade.
 */
export function categoriasPermitidas(valor: unknown): CategoriaModelo[] {
  const lista = Array.isArray(valor) ? valor.filter((c): c is CategoriaModelo => (CATEGORIAS_MODELO as readonly string[]).includes(c as string)) : []
  return lista.length ? [...new Set(lista)] : ['UTILITY']
}

/**
 * A partir de que dia o passo PROVAVELMENTE cai com a janela de 24 h da Meta fechada: o cliente que comprou costuma ter
 * falado com a loja na venda; dois dias depois a janela quase sempre já fechou. Só um aviso na tela da régua.
 */
export const DIA_JANELA_PROVAVELMENTE_FECHADA = 3
export const AVISO_SEM_MODELO = 'Sem modelo: este passo só poderá ser feito por ligação ou com janela aberta'

/** O passo vai pelo WhatsApp, provavelmente com a janela fechada, e não tem modelo? */
export function passoPrecisaDeModelo(p: { tipo_acao: string; dia_offset: number; modelo_id: number | null; ativo?: boolean }): boolean {
  return p.ativo !== false && (p.tipo_acao === 'whatsapp' || p.tipo_acao === 'pesquisa')
    && p.dia_offset >= DIA_JANELA_PROVAVELMENTE_FECHADA && p.modelo_id == null
}

// ── Parâmetros (config da M2/D6: {empresa, lojas}) ──────────────────────────────────────────────
export type Parametro = 'teto_diario' | 'sla_horas' | 'nps_limite_chamado' | 'categorias_modelo' | 'responsavel_padrao' | 'janela_acompanhamento_dias'
export interface DefParametro { porLoja: boolean; padrao: unknown; validar: (v: unknown) => unknown | undefined }

const inteiro = (min: number, max: number) => (v: unknown) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : undefined
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Os parâmetros que a tela grava; `undefined` do validar = valor recusado. Só a empresa ou também por loja. */
export const PARAMETROS: Record<Parametro, DefParametro> = {
  teto_diario: { porLoja: true, padrao: 30, validar: inteiro(1, 500) },
  sla_horas: { porLoja: true, padrao: 'loja_aberta', validar: (v) => (v === 'loja_aberta' || v === 'corridas' ? v : undefined) },
  nps_limite_chamado: { porLoja: false, padrao: 6, validar: inteiro(0, 10) },
  janela_acompanhamento_dias: { porLoja: false, padrao: 3, validar: inteiro(0, 30) },
  categorias_modelo: {
    porLoja: false, padrao: ['UTILITY'],
    validar: (v) => (Array.isArray(v) && v.length > 0 && v.every((c) => (CATEGORIAS_MODELO as readonly string[]).includes(c as string))
      ? [...new Set(v as string[])] : undefined),
  },
  responsavel_padrao: { porLoja: true, padrao: null, validar: (v) => (typeof v === 'string' && UUID.test(v) ? v : undefined) },
}
export const ehParametro = (k: unknown): k is Parametro => typeof k === 'string' && k in PARAMETROS

// ── Régua e passo ───────────────────────────────────────────────────────────────────────────────
export interface ReguaEntrada { nome: string; ativo: boolean; prioridade: number; categorias: number[]; condicao: 'novo' | 'seminovo' | null; ao_recomprar: string }
export interface PassoEntrada {
  ordem: number; dia_offset: number; tipo_acao: string; titulo: string; roteiro: string | null; grupo: string; ativo: boolean
  responsavel: string; modelo_id: number | null; condicao: 'novo' | 'seminovo' | null; tolerancia_dias: number
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const condicao = (v: unknown): 'novo' | 'seminovo' | null => (v === 'novo' || v === 'seminovo' ? v : null)

export function validarRegua(b: Record<string, unknown>): { ok: true; v: ReguaEntrada } | { ok: false; erro: string } {
  const nome = texto(b.nome, 80)
  if (nome.length < 2) return { ok: false, erro: 'Dê um nome à régua.' }
  const prioridade = inteiro(0, 1000)(b.prioridade ?? 0)
  if (prioridade === undefined) return { ok: false, erro: 'Prioridade de 0 a 1000.' }
  const categorias = Array.isArray(b.categorias) ? [...new Set(b.categorias.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : []
  const ao = b.ao_recomprar ?? 'reiniciar'
  if (!['reiniciar', 'manter', 'encerrar'].includes(ao as string)) return { ok: false, erro: 'Escolha o que fazer quando o cliente compra de novo.' }
  return { ok: true, v: { nome, ativo: b.ativo !== false, prioridade: prioridade as number, categorias, condicao: condicao(b.condicao), ao_recomprar: ao as string } }
}

export function validarPasso(b: Record<string, unknown>): { ok: true; v: PassoEntrada } | { ok: false; erro: string } {
  const titulo = texto(b.titulo, 80)
  if (titulo.length < 2) return { ok: false, erro: 'Dê um título ao passo.' }
  const dia = inteiro(0, 3650)(b.dia_offset)
  if (dia === undefined) return { ok: false, erro: 'O dia do passo vai de 0 a 3650.' }
  const ordem = inteiro(1, 100)(b.ordem)
  if (ordem === undefined) return { ok: false, erro: 'Ordem inválida.' }
  if (!['whatsapp', 'ligacao', 'pesquisa', 'tarefa_interna'].includes(b.tipo_acao as string)) return { ok: false, erro: 'Tipo de passo inválido.' }
  if (!['relacionamento', 'produto'].includes((b.grupo ?? 'relacionamento') as string)) return { ok: false, erro: 'Grupo inválido.' }
  const resp = (b.responsavel ?? 'acompanhamento') as string
  if (!(resp === 'acompanhamento' || resp === 'administradores' || /^usuario:[0-9a-f-]{36}$/.test(resp))) return { ok: false, erro: 'Responsável inválido.' }
  const tol = inteiro(0, 365)(b.tolerancia_dias ?? 7)
  if (tol === undefined) return { ok: false, erro: 'Tolerância de 0 a 365 dias.' }
  const modelo = b.modelo_id == null || b.modelo_id === '' ? null : Number(b.modelo_id)
  if (modelo !== null && !(Number.isInteger(modelo) && modelo > 0)) return { ok: false, erro: 'Modelo inválido.' }
  return { ok: true, v: {
    ordem: ordem as number, dia_offset: dia as number, tipo_acao: b.tipo_acao as string, titulo,
    roteiro: texto(b.roteiro, 1500) || null, grupo: (b.grupo ?? 'relacionamento') as string, ativo: b.ativo !== false,
    responsavel: resp, modelo_id: modelo, condicao: condicao(b.condicao), tolerancia_dias: tol as number,
  } }
}
