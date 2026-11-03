import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead } from '@/components/modules/leads/types'
import { telefoneE164 } from '@/lib/telefone-e164'

/**
 * O CARD DO LEAD LÊ O CORE (03/11/2026).
 *
 * Até aqui o card recebia o lead pronto da lista do quadro, que vinha da view
 * `leads` — a página carregava os 1.732 leads (4,5 MB) para abrir um. Agora o
 * card busca o que mostra, e só isso, direto das tabelas:
 *
 *   negocios + contatos     o lead e a pessoa (RLS do usuário: vendedor vê a loja dele)
 *   conversas               não lidas e últimas mensagens, da MESMA loja do negócio
 *   campos_personalizados   campos da empresa cujo módulo dono está ligado
 *   negocios (outra loja)   "também em <loja>" — só nome da loja e id, pelo serviço,
 *                           depois de a RLS confirmar que o usuário vê este negócio
 *
 * O formato `Lead` continua o mesmo para o quadro e o card não mudarem de forma.
 */

export interface CampoDoCard {
  entidade: 'contato' | 'negocio'
  chave: string
  rotulo: string
  tipo: string
  opcoes: string[]
  valor: string
}

export interface OutraLoja {
  filialId: number
  loja: string
  leadId: number
  status: string
}

export interface CardDoLead {
  lead: Lead
  contatoId: number
  filialId: number | null
  outrasLojas: OutraLoja[]
  campos: CampoDoCard[]
}

/** Campos que o card já tem em campo próprio — não aparecem de novo na lista de personalizados. */
const CAMPOS_COM_LUGAR = new Set(['negocio.produto_interessado'])

type Json = Record<string, unknown>

interface LinhaNegocio {
  id: number
  empresa_id: number
  contato_id: number
  filial_id: number | null
  funil_id: number | null
  responsavel_id: string | null
  status: string | null
  valor_estimado: number | null
  motivo_perda_id: number | null
  perdido_em: string | null
  created_at: string | null
  dados: Json | null
  etapa: { slug: string } | null
  contato: {
    id: number; nome: string | null; telefone: string | null; instagram: string | null
    origem: string | null; observacoes: string | null; foto_url: string | null; dados: Json | null
  } | null
}

/** `string`, não literal: o parser de tipos do supabase-js estoura com relação embutida. */
const SELECT_OUTRAS_LOJAS: string = 'id, filial_id, status, created_at, filial:filiais!negocios_filial_id_fkey(nome)'

const SELECT_NEGOCIO: string = `id, empresa_id, contato_id, filial_id, funil_id, responsavel_id, status, valor_estimado,
  motivo_perda_id, perdido_em, created_at, dados,
  etapa:funil_etapas!negocios_etapa_id_fkey(slug),
  contato:contatos!negocios_contato_id_fkey(id, nome, telefone, instagram, origem, observacoes, foto_url, dados)`

const texto = (v: unknown) => (v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v))
const lead_ = (n: LinhaNegocio) => ((n.dados ?? {})._lead ?? {}) as Json

/** O negócio como o usuário o vê (RLS). Nulo = não existe ou não é da loja dele. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function negocioVisivel(db: SupabaseClient<any>, leadId: number): Promise<LinhaNegocio | null> {
  const { data } = await db.from('negocios').select(SELECT_NEGOCIO).eq('id', leadId).maybeSingle()
  return (data as unknown as LinhaNegocio | null) ?? null
}

/**
 * Monta o card. `db` é o cliente do usuário (RLS); `svc`, o de serviço, usado só
 * para os nomes das outras lojas do mesmo contato.
 */
export async function carregarCardDoLead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>, svc: SupabaseClient<any>, leadId: number,
): Promise<CardDoLead | null> {
  const n = await negocioVisivel(db, leadId)
  if (!n || !n.contato) return null
  const c = n.contato
  const l = lead_(n)

  // Conversas da MESMA loja do negócio (filial nula casa com filial nula, como a view fazia).
  const qConversas = db.from('conversas').select('nao_lidas, ultima_mensagem_at, ultima_recebida_at, ultima_enviada_at').eq('contato_id', c.id)
  const [conversas, campos, modulos, outros] = await Promise.all([
    n.filial_id == null ? qConversas.is('filial_id', null) : qConversas.eq('filial_id', n.filial_id),
    db.from('campos_personalizados').select('entidade, chave, rotulo, tipo, opcoes, modulo_dono, ordem')
      .eq('empresa_id', n.empresa_id).eq('ativo', true).in('entidade', ['contato', 'negocio']).order('ordem'),
    db.from('empresa_modulos').select('modulo').eq('empresa_id', n.empresa_id).eq('ativo', true),
    svc.from('negocios').select(SELECT_OUTRAS_LOJAS)
      .eq('contato_id', c.id).not('filial_id', 'is', null).order('created_at', { ascending: false }),
  ])

  type Conv = { nao_lidas: number | null; ultima_mensagem_at: string | null; ultima_recebida_at: string | null; ultima_enviada_at: string | null }
  const convs = (conversas.data ?? []) as Conv[]
  const maior = (k: keyof Conv) => convs.map((x) => x[k] as string | null).filter(Boolean).sort().at(-1) ?? null

  const ligados = new Set(((modulos.data ?? []) as { modulo: string }[]).map((m) => m.modulo))
  type Campo = { entidade: 'contato' | 'negocio'; chave: string; rotulo: string; tipo: string; opcoes: unknown; modulo_dono: string | null }
  const camposDoCard: CampoDoCard[] = ((campos.data ?? []) as Campo[])
    .filter((f) => !f.modulo_dono || ligados.has(f.modulo_dono))
    .filter((f) => !CAMPOS_COM_LUGAR.has(`${f.entidade}.${f.chave}`))
    .map((f) => ({
      entidade: f.entidade, chave: f.chave, rotulo: f.rotulo, tipo: f.tipo,
      opcoes: Array.isArray(f.opcoes) ? (f.opcoes as unknown[]).map(String) : [],
      valor: texto((f.entidade === 'contato' ? c.dados : n.dados)?.[f.chave]),
    }))

  // Uma linha por loja (o negócio mais recente dela), fora a loja deste negócio.
  type Outro = { id: number; filial_id: number; status: string; filial: { nome: string } | null }
  const porLoja = new Map<number, OutraLoja>()
  for (const o of (outros.data ?? []) as unknown as Outro[]) {
    if (o.filial_id === n.filial_id || porLoja.has(o.filial_id)) continue
    porLoja.set(o.filial_id, { filialId: o.filial_id, loja: o.filial?.nome ?? `Loja ${o.filial_id}`, leadId: o.id, status: o.status })
  }

  const lead: Lead = {
    id: n.id,
    nome: c.nome,
    telefone: c.telefone,
    instagram: c.instagram,
    origem: c.origem,
    kanban_status: n.etapa?.slug ?? (l.kanban_status as string | undefined) ?? 'novo',
    responsavel_id: n.responsavel_id,
    observacoes: c.observacoes,
    created_at: n.created_at,
    ativo: l.ativo == null ? true : Boolean(l.ativo),
    primeira_msg: (l.primeira_msg as string | undefined) ?? null,
    msgs_nao_lidas: convs.reduce((s, x) => s + (x.nao_lidas ?? 0), 0),
    ultima_tratativa: (l.ultima_tratativa as string | undefined) ?? null,
    ultima_mensagem_at: maior('ultima_mensagem_at'),
    ultima_recebida_at: maior('ultima_recebida_at'),
    ultima_enviada_at: maior('ultima_enviada_at'),
    produto_interessado: ((n.dados ?? {}).produto_interessado as string | undefined) ?? null,
    valor_estimado: n.valor_estimado,
    convertido_em: l.convertido_em == null ? null : Number(l.convertido_em),
    motivo_perda_id: n.motivo_perda_id,
    perdido_em: n.perdido_em,
    funil_id: n.funil_id,
    foto_url: c.foto_url,
  }

  return { lead, contatoId: c.id, filialId: n.filial_id, outrasLojas: [...porLoja.values()], campos: camposDoCard }
}

/** O que o card grava (cada chave ausente fica como está). */
export interface AlteracaoDoCard {
  nome?: string | null
  telefone?: string | null
  instagram?: string | null
  observacoes?: string | null
  produto_interessado?: string | null
  /** Campos personalizados: chave → valor ('' ou null apaga). */
  campos?: { contato?: Record<string, string | null>; negocio?: Record<string, string | null> }
  /** Assumir o lead ao responder — só se ainda estiver sem responsável. */
  assumir?: boolean
  /** Lead convertido em cliente (id do cliente). */
  convertido_em?: number
  /** A etapa só registrou a última tratativa (painel de chamadas). */
  tratativa?: boolean
  /** Excluir o lead = desativar (dados._lead.ativo), como a view fazia. */
  ativo?: boolean
  /** Interesse estruturado (painel de veículos) — mora em dados._interesse. */
  interesse?: Json | null
}

const limpo = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * O texto do formulário no tipo que o banco aceita (core_validar_dados):
 * numero/moeda → número, booleano → true/false, multi → lista; o resto, texto.
 * Valor que não converte é `undefined` (a rota responde 400 em vez de gravar lixo).
 */
export function valorDoCampo(tipo: string, texto: string): unknown {
  if (tipo === 'numero' || tipo === 'moeda') {
    const n = Number(texto.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }
  if (tipo === 'booleano') return texto === 'true' ? true : texto === 'false' ? false : undefined
  if (tipo === 'multi') return texto.split(',').map((s) => s.trim()).filter(Boolean)
  return texto
}

function mesclar(base: Json | null, valores: Record<string, string | null> | undefined, tipos: Map<string, string> = new Map()): Json {
  const out: Json = { ...(base ?? {}) }
  for (const [k, v] of Object.entries(valores ?? {})) {
    const t = limpo(v)
    if (t == null) { delete out[k]; continue }
    const valor = valorDoCampo(tipos.get(k) ?? 'texto', t)
    if (valor === undefined) throw new ErroDeCampo(k)
    out[k] = valor
  }
  return out
}

class ErroDeCampo extends Error {
  chave: string
  constructor(chave: string) { super(`Valor inválido em "${chave}"`); this.chave = chave }
}

/**
 * Grava o card como o gatilho da view gravava: nome, telefone (com o E.164, que
 * só muda se nenhum OUTRO contato da empresa já o tiver — o índice é único),
 * Instagram e observações em `contatos`; produto e campos em `dados`. A gravação
 * é do usuário (RLS); só a conferência do E.164 olha a empresa toda.
 */
export async function gravarCardDoLead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>, svc: SupabaseClient<any>, leadId: number, userId: string, alt: AlteracaoDoCard,
): Promise<{ error: string | null; assumido?: boolean; responsavelId?: string | null }> {
  const n = await negocioVisivel(db, leadId)
  if (!n || !n.contato) return { error: 'Lead não encontrado' }
  const c = n.contato

  const contato: Json = {}
  if ('nome' in alt) contato.nome = limpo(alt.nome)
  if ('instagram' in alt) contato.instagram = limpo(alt.instagram)
  if ('observacoes' in alt) contato.observacoes = limpo(alt.observacoes)
  if ('telefone' in alt) {
    contato.telefone = limpo(alt.telefone)
    const e164 = telefoneE164(alt.telefone)
    if (e164) {
      const { count } = await svc.from('contatos').select('id', { count: 'exact', head: true })
        .eq('empresa_id', n.empresa_id).eq('telefone_e164', e164).neq('id', c.id)
      if (!count) contato.telefone_e164 = e164
    }
  }
  // Tipos dos campos personalizados, para gravar no formato que o banco valida.
  const tipos = { contato: new Map<string, string>(), negocio: new Map<string, string>() }
  if (alt.campos) {
    const { data } = await db.from('campos_personalizados').select('entidade, chave, tipo')
      .eq('empresa_id', n.empresa_id).eq('ativo', true).in('entidade', ['contato', 'negocio'])
    for (const f of (data ?? []) as { entidade: 'contato' | 'negocio'; chave: string; tipo: string }[]) tipos[f.entidade].set(f.chave, f.tipo)
  }

  // Tudo convertido ANTES de gravar: valor inválido não deixa metade gravada.
  let dados: Json = { ...(n.dados ?? {}) }
  let mudou = false
  const comLead = (extra: Json) => ({ ...dados, _lead: { ...((dados._lead ?? {}) as Json), ...extra } })
  try {
    if (alt.campos?.contato) contato.dados = mesclar(c.dados, alt.campos.contato, tipos.contato)
    if ('produto_interessado' in alt) { dados = mesclar(dados, { produto_interessado: alt.produto_interessado ?? null }); mudou = true }
    if (alt.campos?.negocio) { dados = mesclar(dados, alt.campos.negocio, tipos.negocio); mudou = true }
  } catch (e) {
    return { error: e instanceof ErroDeCampo ? e.message : 'Valor inválido' }
  }
  if (alt.convertido_em != null) { dados = comLead({ convertido_em: alt.convertido_em }); mudou = true }
  if (alt.tratativa) { dados = comLead({ ultima_tratativa: new Date().toISOString() }); mudou = true }
  if (typeof alt.ativo === 'boolean') { dados = comLead({ ativo: alt.ativo }); mudou = true }
  if ('interesse' in alt) {
    const { _interesse: _, ...resto } = dados
    dados = alt.interesse == null ? resto : { ...resto, _interesse: alt.interesse }
    mudou = true
  }

  if (Object.keys(contato).length) {
    const { error } = await db.from('contatos').update(contato).eq('id', c.id)
    if (error) return { error: error.message }
  }
  if (mudou) {
    const { error } = await db.from('negocios').update({ dados }).eq('id', n.id)
    if (error) return { error: error.message }
  }

  if (alt.assumir) {
    // Quem responder primeiro fica com o lead; o segundo é avisado (`.is(null)`).
    const base = dados
    const { data } = await db.from('negocios')
      .update({ responsavel_id: userId, dados: { ...base, _lead: { ...((base._lead ?? {}) as Json), responsavel_desde: new Date().toISOString() } } })
      .eq('id', n.id).is('responsavel_id', null).select('id')
    if (data?.length) return { error: null, assumido: true, responsavelId: userId }
    const { data: atual } = await db.from('negocios').select('responsavel_id').eq('id', n.id).maybeSingle()
    return { error: null, assumido: false, responsavelId: (atual?.responsavel_id as string | null) ?? null }
  }
  return { error: null }
}
