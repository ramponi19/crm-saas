import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A INBOX ÚNICA LÊ O CORE DIRETO (04/11/2026): `conversas`, `contatos`,
 * `mensagens`, `canais` e `eventos`, pelo PostgREST, com a RLS de sempre — a loja
 * vem da loja selecionada no topo (dono) ou da loja do vendedor. Nada aqui lê as
 * views `leads` nem `lead_mensagens`, e nada precisa de função nova no banco.
 *
 * Uma conversa é um contato num canal (`unique (empresa_id, contato_id, canal_id)`)
 * e mora na loja do canal (gatilho `core_filial_do_canal`). O contador
 * `conversas.nao_lidas` é mantido pelo gatilho `core_mensagens_sincroniza`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>

export type CanalTipo = 'whatsapp' | 'instagram' | 'messenger'
export const CANAIS: { tipo: CanalTipo; nome: string }[] = [
  { tipo: 'whatsapp', nome: 'WhatsApp' },
  { tipo: 'instagram', nome: 'Instagram' },
  { tipo: 'messenger', nome: 'Messenger' },
]

export interface FiltrosInbox {
  canal: CanalTipo | null
  naoLidas: boolean
  /** A última mensagem da conversa é do cliente (mesmo que já lida). */
  aguardando: boolean
  /** id do usuário dono do negócio do contato; 'nenhum' = sem responsável. */
  responsavel: string | null
  busca: string
}

export const FILTROS_VAZIOS: FiltrosInbox = { canal: null, naoLidas: false, aguardando: false, responsavel: null, busca: '' }

export interface ContatoInbox { id: number; nome: string | null; telefone: string | null; instagram: string | null; foto_url: string | null }
export interface CanalInbox { id: number; tipo: CanalTipo; nome_exibicao: string | null; filial_id: number | null }

export interface ConversaInbox {
  id: number
  contato_id: number | null
  canal_id: number | null
  filial_id: number | null
  nao_lidas: number
  ultima_mensagem_at: string | null
  ultima_recebida_at: string | null
  ultima_enviada_at: string | null
  contato: ContatoInbox | null
  canal: CanalInbox | null
}

export interface Cursor { momento: string; id: number }

export const POR_PAGINA = 40
/** Lote de varredura do filtro "aguardando resposta" (comparação de duas colunas, feita aqui). */
const LOTE_VARREDURA = 200
/** Teto de lotes por página no "aguardando": acima disso a página volta curta e o "carregar mais" continua. */
const LOTES_MAX = 6

const COLUNAS_CONVERSA = 'id, contato_id, canal_id, filial_id, nao_lidas, ultima_mensagem_at, ultima_recebida_at, ultima_enviada_at'
const COLUNAS_CONTATO = 'id, nome, telefone, instagram, foto_url'
const COLUNAS_CANAL = 'id, tipo, nome_exibicao, filial_id'

/** A última mensagem é do cliente: ninguém respondeu depois dela. */
export function aguardandoResposta(c: Pick<ConversaInbox, 'ultima_recebida_at' | 'ultima_enviada_at'>): boolean {
  if (!c.ultima_recebida_at) return false
  if (!c.ultima_enviada_at) return true
  return new Date(c.ultima_recebida_at).getTime() > new Date(c.ultima_enviada_at).getTime()
}

/** Busca: só dígitos vira telefone; "@algo" vira Instagram; o resto procura nos três. */
export function termosDaBusca(texto: string): { nome: string | null; telefone: string | null; instagram: string | null } {
  const t = texto.trim().replace(/[%*,()]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return { nome: null, telefone: null, instagram: null }
  const digitos = t.replace(/\D/g, '')
  if (t.startsWith('@')) return { nome: null, telefone: null, instagram: t.slice(1) || null }
  if (digitos.length >= 4 && digitos.length >= t.replace(/[\s()+-]/g, '').length) return { nome: null, telefone: digitos, instagram: null }
  return { nome: t, telefone: digitos.length >= 4 ? digitos : null, instagram: t.replace(/\s/g, '') }
}

/** Filtro de cursor (ordem: última mensagem desc, id desc). */
export function filtroDoCursor(c: Cursor): string {
  return `ultima_mensagem_at.lt.${c.momento},and(ultima_mensagem_at.eq.${c.momento},id.lt.${c.id})`
}

async function contatosDaBusca(db: Db, busca: string): Promise<number[] | null> {
  const t = termosDaBusca(busca)
  const ou: string[] = []
  if (t.nome) ou.push(`nome.ilike.*${t.nome}*`)
  if (t.telefone) ou.push(`telefone.ilike.*${t.telefone}*`, `telefone_e164.ilike.*${t.telefone}*`)
  if (t.instagram) ou.push(`instagram.ilike.*${t.instagram}*`)
  if (!ou.length) return null
  const { data } = await db.from('contatos').select('id').or(ou.join(',')).limit(300)
  return ((data ?? []) as { id: number }[]).map((c) => c.id)
}

/** Canais da empresa visíveis para esta sessão (poucas linhas; a tela guarda). */
export async function lerCanais(db: Db): Promise<CanalInbox[]> {
  const { data } = await db.from('canais').select(COLUNAS_CANAL).order('id')
  return (data ?? []) as CanalInbox[]
}

/**
 * Uma página da lista. `canais` vem da tela (lerCanais) para não reler a cada página.
 * O filtro "aguardando" compara duas colunas — o PostgREST não faz —, então varre
 * em lotes e guarda só as que batem; o cursor segue a última linha VARRIDA.
 */
export async function listarConversas(
  db: Db, f: FiltrosInbox, canais: CanalInbox[], cursor?: Cursor | null,
): Promise<{ itens: ConversaInbox[]; proximo: Cursor | null }> {
  let contatos: number[] | null = null
  if (f.busca.trim()) {
    contatos = await contatosDaBusca(db, f.busca)
    if (contatos && contatos.length === 0) return { itens: [], proximo: null }
  }
  const idsCanal = f.canal ? canais.filter((c) => c.tipo === f.canal).map((c) => c.id) : null
  if (idsCanal && idsCanal.length === 0) return { itens: [], proximo: null }

  // Responsável = dono do negócio do contato (a RLS mostra só os negócios da loja).
  const comResp = f.responsavel != null
  const embedContato = comResp
    ? `contato:contatos!inner(${COLUNAS_CONTATO}, negocios!negocios_contato_id_fkey!inner(responsavel_id))`
    : `contato:contatos(${COLUNAS_CONTATO})`

  const itens: ConversaInbox[] = []
  let atual = cursor ?? null
  const lote = f.aguardando ? LOTE_VARREDURA : POR_PAGINA
  /** `string`, não literal: o parser de tipos do supabase-js estoura com relação embutida. */
  const selecao: string = `${COLUNAS_CONVERSA}, ${embedContato}, canal:canais(${COLUNAS_CANAL})`
  for (let volta = 0; volta < (f.aguardando ? LOTES_MAX : 1); volta++) {
    // Tipo solto de propósito: o construtor reatribuído com relação embutida estoura o tsc (TS2589).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from('conversas').select(selecao)
      .not('ultima_mensagem_at', 'is', null)
    if (idsCanal) q = q.in('canal_id', idsCanal)
    if (f.naoLidas) q = q.gt('nao_lidas', 0)
    if (f.aguardando) q = q.not('ultima_recebida_at', 'is', null)
    if (contatos) q = q.in('contato_id', contatos)
    if (comResp) q = f.responsavel === 'nenhum'
      ? q.is('contato.negocios.responsavel_id', null)
      : q.eq('contato.negocios.responsavel_id', f.responsavel as string)
    if (atual) q = q.or(filtroDoCursor(atual))
    const { data, error } = await q.order('ultima_mensagem_at', { ascending: false }).order('id', { ascending: false }).limit(lote)
    if (error) throw new Error(error.message)
    const linhas = ((data ?? []) as unknown as (ConversaInbox & { contato: (ContatoInbox & { negocios?: unknown }) | null })[])
      .map(({ contato, ...c }) => ({ ...c, contato: contato ? { id: contato.id, nome: contato.nome, telefone: contato.telefone, instagram: contato.instagram, foto_url: contato.foto_url } : null }))
    for (const l of linhas) if (!f.aguardando || aguardandoResposta(l)) itens.push(l)
    const ultima = linhas[linhas.length - 1]
    atual = ultima ? { momento: ultima.ultima_mensagem_at as string, id: ultima.id } : null
    if (linhas.length < lote) return { itens, proximo: null }
    if (itens.length >= POR_PAGINA) break
  }
  return { itens, proximo: atual }
}

/** Uma conversa pelo id (a RLS devolve nada se for de outra loja). */
export async function lerConversa(db: Db, id: number): Promise<ConversaInbox | null> {
  const selecao: string = `${COLUNAS_CONVERSA}, contato:contatos(${COLUNAS_CONTATO}), canal:canais(${COLUNAS_CANAL})`
  const { data } = await db.from('conversas').select(selecao).eq('id', id).maybeSingle()
  return (data ?? null) as unknown as ConversaInbox | null
}

// ── Mensagens ───────────────────────────────────────────────────────────────

export const MSGS_POR_PAGINA = 200
export const COLUNAS_MSG = 'id, conversa_id, direcao, conteudo, created_at, tipo, origem, midia_url, status_entrega, erro_envio, external_id, usuario_id, transcricao, midia_retida_em, lida'
export interface MensagemInbox {
  id: number; conversa_id: number | null; direcao: string; conteudo: string | null; created_at: string
  tipo: string | null; origem: string | null; midia_url: string | null; status_entrega: string | null
  erro_envio: string | null; external_id: string | null; usuario_id: string | null
  transcricao: string | null; midia_retida_em: string | null; lida: boolean
}

/** As 200 mais recentes (ou as 200 antes de `antes`), em ordem de leitura; `temMais` = há anteriores. */
export async function mensagensDaConversa(db: Db, conversaId: number, antes?: { momento: string; id: number }) {
  let q = db.from('mensagens').select(COLUNAS_MSG).eq('conversa_id', conversaId)
  if (antes) q = q.or(`created_at.lt.${antes.momento},and(created_at.eq.${antes.momento},id.lt.${antes.id})`)
  const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(MSGS_POR_PAGINA + 1)
  if (error) throw new Error(error.message)
  const linhas = (data ?? []) as MensagemInbox[]
  return { mensagens: linhas.slice(0, MSGS_POR_PAGINA).reverse(), temMais: linhas.length > MSGS_POR_PAGINA }
}

/**
 * Quem abriu a conversa leu o que estava nela — toda ela, não só as 200 da tela.
 * O contador de `conversas` é espelho: o gatilho o recalcula desta escrita.
 */
export async function marcarConversaLida(db: Db, conversaId: number): Promise<number> {
  const { count } = await db.from('mensagens').update({ lida: true }, { count: 'exact' })
    .eq('conversa_id', conversaId).eq('direcao', 'recebida').eq('lida', false)
  return count ?? 0
}

// ── Notas (eventos 'conversa.nota') ─────────────────────────────────────────

/**
 * NOTA INTERNA DA CONVERSA (04/11/2026, sem migração): uma linha em `eventos`
 * (tipo 'conversa.nota', entidade 'conversa'), na loja da conversa. A RLS de
 * `eventos` deixa gravar na própria empresa e ler pela loja; não deixa editar nem
 * apagar (update/delete = false) — a nota é registro, como o histórico.
 * Nunca vai para o cliente.
 */
export const TIPO_NOTA = 'conversa.nota'
export interface NotaInbox { id: number; texto: string; por_usuario: string | null; em: string }

export async function notasDaConversa(db: Db, conversaId: number): Promise<NotaInbox[]> {
  const { data } = await db.from('eventos').select('id, dados, por_usuario, em')
    .eq('tipo', TIPO_NOTA).eq('entidade', 'conversa').eq('entidade_id', conversaId).order('em')
  return ((data ?? []) as { id: number; dados: { texto?: string } | null; por_usuario: string | null; em: string }[])
    .map((n) => ({ id: n.id, texto: n.dados?.texto ?? '', por_usuario: n.por_usuario, em: n.em }))
}

export async function gravarNota(
  db: Db, conversa: Pick<ConversaInbox, 'id' | 'filial_id'>, empresaId: number, userId: string, texto: string,
): Promise<NotaInbox> {
  const t = texto.trim()
  if (!t) throw new Error('Escreva a nota.')
  const { data, error } = await db.from('eventos').insert({
    empresa_id: empresaId, filial_id: conversa.filial_id, tipo: TIPO_NOTA,
    entidade: 'conversa', entidade_id: conversa.id, dados: { texto: t }, por_usuario: userId,
  }).select('id, em').single()
  if (error || !data) throw new Error(error?.message ?? 'Não foi possível gravar a nota.')
  return { id: (data as { id: number }).id, texto: t, por_usuario: userId, em: (data as { em: string }).em }
}

// ── O negócio da conversa (para responder, tarefa e card) ──────────────────

export interface NegocioDaConversa { id: number; responsavel_id: string | null; status: string | null }

/**
 * O negócio do contato NA LOJA da conversa — é por ele que a Edge resolve o canal
 * de envio e é ele que o card abre. Aberto primeiro; senão o mais recente.
 */
export async function negocioDaConversa(db: Db, c: Pick<ConversaInbox, 'contato_id' | 'filial_id'>): Promise<NegocioDaConversa | null> {
  if (c.contato_id == null) return null
  let q = db.from('negocios').select('id, responsavel_id, status, created_at').eq('contato_id', c.contato_id)
  q = c.filial_id == null ? q.is('filial_id', null) : q.eq('filial_id', c.filial_id)
  const { data } = await q.order('created_at', { ascending: false }).limit(10)
  const linhas = (data ?? []) as (NegocioDaConversa & { created_at: string })[]
  const escolhido = linhas.find((n) => n.status === 'aberto') ?? linhas[0]
  return escolhido ? { id: escolhido.id, responsavel_id: escolhido.responsavel_id, status: escolhido.status } : null
}

export async function criarTarefa(
  db: Db, empresaId: number, negocio: NegocioDaConversa, contatoId: number | null, userId: string,
  t: { titulo: string; vencimento: string | null; tipo: string },
) {
  const titulo = t.titulo.trim()
  if (!titulo) throw new Error('Escreva a tarefa.')
  const { data, error } = await db.from('tarefas').insert({
    empresa_id: empresaId, lead_id: negocio.id, negocio_id: negocio.id, contato_id: contatoId,
    titulo, tipo: t.tipo || 'outro', vencimento: t.vencimento, responsavel_id: userId,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Não foi possível criar a tarefa.')
  return (data as { id: number }).id
}
