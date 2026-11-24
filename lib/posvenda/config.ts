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
export function passoPrecisaDeModelo(p: { tipo_acao: string; dia_offset: number; modelo_id: number | null; ativo?: boolean; ancora_tipo?: string | null }): boolean {
  // Fora da âncora "venda" (data do ano, campo, uso) o passo cai longe da compra: janela fechada.
  const longe = (p.ancora_tipo ?? 'venda') !== 'venda' || p.dia_offset >= DIA_JANELA_PROVAVELMENTE_FECHADA
  return p.ativo !== false && (p.tipo_acao === 'whatsapp' || p.tipo_acao === 'pesquisa') && longe && p.modelo_id == null
}

// ── Parâmetros (config da M2/D6: {empresa, lojas}) ──────────────────────────────────────────────
export type Parametro = 'teto_diario' | 'sla_horas' | 'nps_limite_chamado' | 'categorias_modelo' | 'responsavel_padrao' | 'janela_acompanhamento_dias'
  | 'link_avaliacao' | 'mensagem_promotor' | 'mensagem_neutro' | 'categorias_fonte' | 'sla_pausa_terceiro'
export interface DefParametro { porLoja: boolean; padrao: unknown; validar: (v: unknown) => unknown | undefined }

const inteiro = (min: number, max: number) => (v: unknown) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : undefined
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const textoLivre = (max: number) => (v: unknown) => (typeof v === 'string' && v.trim().length >= 3 ? v.trim().slice(0, max) : undefined)
const url = (v: unknown) => {
  if (typeof v !== 'string') return undefined
  try { const u = new URL(v.trim()); return u.protocol === 'https:' ? u.toString() : undefined } catch { return undefined }
}

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
  // Depois da nota (bloco 4): link da avaliação no Google por loja (https) e as mensagens sugeridas.
  link_avaliacao: { porLoja: true, padrao: null, validar: url },
  mensagem_promotor: { porLoja: false, padrao: null, validar: textoLivre(600) },
  mensagem_neutro: { porLoja: false, padrao: null, validar: textoLivre(600) },
  // De onde vêm as categorias da venda: as do Estoque (padrão) ou as próprias do Pós-venda (quem não usa o Estoque).
  categorias_fonte: { porLoja: false, padrao: 'estoque', validar: (v) => (v === 'estoque' || v === 'proprias' ? v : undefined) },
  // "Aguardando terceiro" (assistência, fornecedor) também pausa o prazo do chamado? "Aguardando cliente" sempre pausa.
  sla_pausa_terceiro: { porLoja: false, padrao: false, validar: (v) => (typeof v === 'boolean' ? v : undefined) },
}
export const ehParametro = (k: unknown): k is Parametro => typeof k === 'string' && k in PARAMETROS

// ── Régua e passo ───────────────────────────────────────────────────────────────────────────────
export interface ReguaEntrada { nome: string; ativo: boolean; prioridade: number; categorias: number[]; condicao: 'novo' | 'usado' | null; ao_recomprar: string }
export type AncoraTipo = 'venda' | 'data_fixa' | 'campo_data' | 'uso'
export const ANCORAS: Record<AncoraTipo, string> = {
  venda: 'Dias depois da venda', data_fixa: 'Data fixa no ano', campo_data: 'Data de um campo', uso: 'Uso estimado',
}
export type OperadorFiltro = 'igual' | 'diferente' | 'contem' | 'maior' | 'menor' | 'preenchido'
export const OPERADORES: Record<OperadorFiltro, string> = {
  igual: 'é igual a', diferente: 'é diferente de', contem: 'contém', maior: 'é maior que', menor: 'é menor que', preenchido: 'está preenchido',
}
export interface FiltroCampo { chave: string; op: OperadorFiltro; valor: string }
export interface PassoEntrada {
  ordem: number; dia_offset: number; tipo_acao: string; titulo: string; roteiro: string | null; grupo: string; ativo: boolean
  responsavel: string; modelo_id: number | null; condicao: 'novo' | 'usado' | null; tolerancia_dias: number
  ancora_tipo: AncoraTipo; ancora_mes_dia: string | null; ancora_campo: string | null
  uso_alvo: number | null; uso_ritmo_campo: string | null; uso_ritmo_padrao: number | null
  repetir_intervalo: number | null; repetir_unidade: 'dias' | 'meses' | null; repetir_max: number | null
  campos: FiltroCampo[]
}

const CHAVE = /^[a-z][a-z0-9_]{0,62}$/
const MES_DIA = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/
/** Número positivo; aceita "10.000" e "12,5". */
export function numeroPositivo(v: unknown): number | null {
  let n: unknown = v
  if (typeof v === 'string') {
    const t = v.trim()
    n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t)
  }
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}
const vazio = (v: unknown) => v == null || v === ''

/** Filtros por campo do passo: chave de campo, operador conhecido e valor (menos em "preenchido"). */
export function validarFiltrosCampos(v: unknown): FiltroCampo[] | string {
  if (vazio(v)) return []
  if (!Array.isArray(v) || v.length > 10) return 'Até 10 filtros por campo.'
  const out: FiltroCampo[] = []
  for (const f of v as Record<string, unknown>[]) {
    const chave = typeof f?.chave === 'string' ? f.chave : ''
    const op = f?.op as OperadorFiltro
    const valor = typeof f?.valor === 'string' || typeof f?.valor === 'number' ? String(f.valor).trim().slice(0, 120) : ''
    if (!CHAVE.test(chave)) return 'Escolha o campo do filtro.'
    if (!(op in OPERADORES)) return 'Operador de filtro inválido.'
    if (op !== 'preenchido' && !valor) return 'Informe o valor do filtro.'
    if ((op === 'maior' || op === 'menor') && !Number.isFinite(Number(valor.replace(',', '.')))) return 'Maior e menor comparam números.'
    out.push({ chave, op, valor: op === 'preenchido' ? '' : valor })
  }
  return out
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
// 'seminovo' (valor antigo) é aceito e gravado como 'usado' (migração 20261124002000)
const condicao = (v: unknown): 'novo' | 'usado' | null => (v === 'novo' ? 'novo' : v === 'usado' || v === 'seminovo' ? 'usado' : null)

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
  const ancora = (b.ancora_tipo ?? 'venda') as AncoraTipo
  if (!(ancora in ANCORAS)) return { ok: false, erro: 'Escolha quando o passo acontece.' }
  // Fora da venda o ajuste pode ser negativo (ex.: 7 dias antes do aniversário).
  const dia = ancora === 'venda' ? inteiro(0, 3650)(b.dia_offset) : inteiro(-365, 3650)(b.dia_offset ?? 0)
  if (dia === undefined) return { ok: false, erro: ancora === 'venda' ? 'O dia do passo vai de 0 a 3650.' : 'O ajuste vai de 365 dias antes a 3650 depois.' }
  const mesDia = ancora === 'data_fixa' ? String(b.ancora_mes_dia ?? '') : null
  if (mesDia !== null && !MES_DIA.test(mesDia)) return { ok: false, erro: 'Escolha o dia e o mês.' }
  const campo = ancora === 'campo_data' || ancora === 'uso' ? String(b.ancora_campo ?? '') : null
  if (campo !== null && !CHAVE.test(campo)) return { ok: false, erro: ancora === 'uso' ? 'Escolha o campo do uso.' : 'Escolha o campo de data.' }
  let usoAlvo: number | null = null, usoRitmoCampo: string | null = null, usoRitmo: number | null = null
  if (ancora === 'uso') {
    usoAlvo = numeroPositivo(b.uso_alvo)
    if (usoAlvo === null) return { ok: false, erro: 'Informe a cada quanto de uso (ex.: 10000).' }
    usoRitmoCampo = vazio(b.uso_ritmo_campo) ? null : String(b.uso_ritmo_campo)
    if (usoRitmoCampo !== null && !CHAVE.test(usoRitmoCampo)) return { ok: false, erro: 'Campo do ritmo inválido.' }
    usoRitmo = numeroPositivo(b.uso_ritmo_padrao)
    if (usoRitmo === null && usoRitmoCampo === null) return { ok: false, erro: 'Informe o uso por dia (padrão) ou o campo que o traz.' }
  }
  let repIntervalo: number | null = null, repUnidade: 'dias' | 'meses' | null = null, repMax: number | null = null
  if (b.repetir === true || (b.repetir !== false && !vazio(b.repetir_intervalo))) {
    // No passo de uso a repetição é a cada `uso_alvo`: o intervalo só liga a repetição.
    const iv = ancora === 'uso' ? 1 : inteiro(1, 3650)(b.repetir_intervalo)
    if (iv === undefined) return { ok: false, erro: 'Repetir a cada 1 a 3650.' }
    const un = ancora === 'uso' ? 'dias' : b.repetir_unidade
    if (un !== 'dias' && un !== 'meses') return { ok: false, erro: 'Repetir a cada quantos dias ou meses?' }
    const mx = vazio(b.repetir_max) ? null : inteiro(2, 1000)(b.repetir_max)
    if (mx === undefined) return { ok: false, erro: 'O limite de repetições vai de 2 a 1000 (vazio = sem limite).' }
    repIntervalo = iv as number; repUnidade = un; repMax = mx
  }
  const campos = validarFiltrosCampos(b.campos)
  if (typeof campos === 'string') return { ok: false, erro: campos }
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
    ancora_tipo: ancora, ancora_mes_dia: mesDia, ancora_campo: campo, uso_alvo: usoAlvo, uso_ritmo_campo: usoRitmoCampo, uso_ritmo_padrao: usoRitmo,
    repetir_intervalo: repIntervalo, repetir_unidade: repUnidade, repetir_max: repMax, campos,
  } }
}

/** Os filtros gravados no passo (jsonb): condição e campos. */
export function filtrosDoPasso(v: Pick<PassoEntrada, 'condicao' | 'campos'>): Record<string, unknown> {
  const f: Record<string, unknown> = {}
  if (v.condicao) f.condicao = v.condicao
  if (v.campos.length) f.campos = v.campos
  return f
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const numeroBr = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const ajuste = (d: number) => (d === 0 ? '' : d > 0 ? ` (${d} ${d === 1 ? 'dia' : 'dias'} depois)` : ` (${-d} ${d === -1 ? 'dia' : 'dias'} antes)`)

export interface QuandoDoPasso {
  dia_offset: number; ancora_tipo?: string | null; ancora_mes_dia?: string | null; ancora_campo?: string | null
  uso_alvo?: number | null; uso_ritmo_campo?: string | null; uso_ritmo_padrao?: number | null
  repetir_intervalo?: number | null; repetir_unidade?: string | null; repetir_max?: number | null
}

/** Quando o passo acontece, em português (tela da régua). `rotulos` traduz a chave do campo no nome dele. */
export function descreverQuando(p: QuandoDoPasso, rotulos: Record<string, string> = {}): string {
  const nome = (c?: string | null) => (c ? rotulos[c] ?? c : 'campo')
  const tipo = p.ancora_tipo ?? 'venda'
  let base: string
  if (tipo === 'data_fixa') {
    const [m, d] = (p.ancora_mes_dia ?? '01-01').split('-').map(Number)
    const anual = p.repetir_intervalo === 12 && p.repetir_unidade === 'meses'
    base = anual ? `Todo ${d} de ${MESES[(m || 1) - 1]}${ajuste(p.dia_offset)}` : `No próximo ${d} de ${MESES[(m || 1) - 1]} depois da venda${ajuste(p.dia_offset)}`
  } else if (tipo === 'campo_data') {
    base = `Na data de “${nome(p.ancora_campo)}”${ajuste(p.dia_offset)}`
  } else if (tipo === 'uso') {
    const ritmo = p.uso_ritmo_campo
      ? `ritmo pelo campo “${nome(p.uso_ritmo_campo)}”${p.uso_ritmo_padrao ? `, senão ${numeroBr(p.uso_ritmo_padrao)} por dia` : ''}`
      : `${numeroBr(p.uso_ritmo_padrao ?? 0)} por dia`
    base = `Quando “${nome(p.ancora_campo)}” chegar a +${numeroBr(p.uso_alvo ?? 0)} (${ritmo})${ajuste(p.dia_offset)}`
  } else {
    base = p.dia_offset === 0 ? 'No dia da venda' : `${p.dia_offset} ${p.dia_offset === 1 ? 'dia' : 'dias'} depois da venda`
  }
  if (p.repetir_intervalo) {
    if (tipo === 'uso') base += `, repete a cada +${numeroBr(p.uso_alvo ?? 0)}`
    else if (p.repetir_unidade === 'meses' && p.repetir_intervalo === 12) base += tipo === 'data_fixa' ? '' : ', todo ano'
    else {
      const un = p.repetir_unidade === 'meses' ? (p.repetir_intervalo === 1 ? 'mês' : 'meses') : (p.repetir_intervalo === 1 ? 'dia' : 'dias')
      base += `, repete a cada ${p.repetir_intervalo} ${un}`
    }
    if (p.repetir_max) base += ` (até ${p.repetir_max} vezes)`
  }
  return base
}

// ── Categorias próprias e campos da venda ─────────────────────────────────────────────────────────
export type TipoCampoVenda = 'texto' | 'numero' | 'data' | 'opcao'
export const TIPOS_CAMPO: Record<TipoCampoVenda, string> = { texto: 'Texto', numero: 'Número', data: 'Data', opcao: 'Lista de opções' }
export interface CampoVendaEntrada { rotulo: string; chave: string; tipo: TipoCampoVenda; opcoes: string[]; obrigatorio: boolean; ativo: boolean }

/** Chave do campo a partir do nome: "Próxima revisão" → proxima_revisao. */
export function chaveDoRotulo(rotulo: string): string {
  const k = rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return /^[a-z]/.test(k) ? k : k ? `campo_${k}` : ''
}

export function validarCampoVenda(b: Record<string, unknown>): { ok: true; v: CampoVendaEntrada } | { ok: false; erro: string } {
  const rotulo = texto(b.rotulo, 60)
  if (rotulo.length < 2) return { ok: false, erro: 'Dê um nome ao campo.' }
  const chave = typeof b.chave === 'string' && b.chave ? b.chave : chaveDoRotulo(rotulo)
  if (!CHAVE.test(chave) || chave === 'venda') return { ok: false, erro: 'Nome de campo inválido.' }
  const tipo = (b.tipo ?? 'texto') as TipoCampoVenda
  if (!(tipo in TIPOS_CAMPO)) return { ok: false, erro: 'Tipo de campo inválido.' }
  const opcoes = tipo === 'opcao' && Array.isArray(b.opcoes)
    ? [...new Set(b.opcoes.filter((o): o is string => typeof o === 'string').map((o) => o.trim().slice(0, 60)).filter(Boolean))].slice(0, 50) : []
  if (tipo === 'opcao' && opcoes.length < 2) return { ok: false, erro: 'Uma lista precisa de ao menos 2 opções.' }
  return { ok: true, v: { rotulo, chave, tipo, opcoes, obrigatorio: b.obrigatorio === true, ativo: b.ativo !== false } }
}

/** "Não quero receber ofertas" (core.sem_ofertas; migração 20261124001900): padrões do Nexus. */
export const BOTAO_SEM_OFERTAS_PADRAO = 'Não quero receber ofertas'
export const CONFIRMACAO_SEM_OFERTAS_PADRAO = 'Pronto, {{nome}}: você não vai mais receber ofertas da nossa loja. Os avisos sobre a sua compra continuam chegando.'

// ── Depois da nota (C7 bloco 4) ─────────────────────────────────────────────────────────────────
/** Textos padrão do Nexus (a empresa troca em Configurações › Pós-venda). Variáveis: {{nome}} e {{link}}. */
export const MENSAGEM_PROMOTOR_PADRAO = 'Que bom, {{nome}}! Obrigado pela nota. Se puder, conte como foi no Google, ajuda muito a loja: {{link}}'
export const MENSAGEM_NEUTRO_PADRAO = 'Obrigado pela nota, {{nome}}! O que poderia ter sido melhor?'

export type FaixaNota = 'promotor' | 'neutro' | 'detrator'
export interface DepoisDaNota { faixa: FaixaNota; texto: string | null; aviso: string | null }

/**
 * O que a fila sugere logo depois da nota (o cliente acabou de responder: a janela de 24 h está aberta e vai como
 * mensagem normal). 9–10 promotor: pedido de avaliação no Google com o link da loja; 7–8 (acima do limite que abre
 * chamado): pergunta curta do que poderia ter sido melhor; até o limite: o chamado já foi aberto, nada a sugerir.
 */
export function depoisDaNota(nota: number, opcoes: { limiteChamado: number; nome: string; link: string | null
  textoPromotor?: string | null; textoNeutro?: string | null }): DepoisDaNota {
  const nome = (opcoes.nome ?? '').trim().split(/\s+/)[0] ?? ''
  const trocar = (t: string) => t.replace(/\{\{\s*nome\s*\}\}/gi, nome).replace(/\{\{\s*link\s*\}\}/gi, opcoes.link ?? '')
    .replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?])/g, '$1').trim()
  if (nota <= opcoes.limiteChamado) return { faixa: 'detrator', texto: null, aviso: 'Chamado aberto para os administradores.' }
  if (nota >= 9) {
    if (!opcoes.link) return { faixa: 'promotor', texto: null, aviso: 'Promotor: configure o link de avaliação da loja em Configurações › Pós-venda para sugerir o pedido de avaliação.' }
    return { faixa: 'promotor', texto: trocar(opcoes.textoPromotor || MENSAGEM_PROMOTOR_PADRAO), aviso: null }
  }
  return { faixa: 'neutro', texto: trocar(opcoes.textoNeutro || MENSAGEM_NEUTRO_PADRAO), aviso: null }
}
