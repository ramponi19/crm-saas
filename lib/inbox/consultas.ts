import type { SupabaseClient } from '@supabase/supabase-js'
import { nadaGravado } from '@/lib/linhas-afetadas'
import { conversaEsperando, lerEsperando, type MapaEsperando } from '@/lib/esperando'
import { FILTRO_ETIQUETAS_VAZIO, filtroEtiquetasAtivo, type FiltroEtiquetas } from '@/lib/etiquetas'

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
  /** Esperando resposta pela regra única (últimas 72 h; `lib/esperando.ts`). */
  aguardando: boolean
  /**
   * Sem resposta há MAIS de 72 h (11/11/2026, pedido do Lucas): saíram da janela do "esperando"
   * e não podem sumir de vista. Mesma regra, fora da janela: canais da loja juntos, envio que
   * falhou não conta. O contador do topo do quadro continua só com as 72 h.
   */
  antigos: boolean
  /** id do usuário dono do negócio do contato; 'nenhum' = sem responsável. */
  responsavel: string | null
  busca: string
  /** Etiqueta do contato: contém alguma de `com`, não contém nenhuma de `sem` (11/11/2026). */
  etiquetas: FiltroEtiquetas
}

export const FILTROS_VAZIOS: FiltrosInbox = { canal: null, naoLidas: false, aguardando: false, antigos: false, responsavel: null, busca: '', etiquetas: FILTRO_ETIQUETAS_VAZIO }

export interface ContatoInbox { id: number; nome: string | null; telefone: string | null; instagram: string | null; foto_url: string | null; etiqueta_ids?: number[] }
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
/** Teto de conversas lidas no filtro "aguardando resposta" (a regra de 72 h deixa poucas centenas). */
const TETO_AGUARDANDO = 1000

const COLUNAS_CONVERSA = 'id, contato_id, canal_id, filial_id, nao_lidas, ultima_mensagem_at, ultima_recebida_at, ultima_enviada_at'
const COLUNAS_CONTATO = 'id, nome, telefone, instagram, foto_url, etiqueta_ids'
const COLUNAS_CANAL = 'id, tipo, nome_exibicao, filial_id'

/**
 * A última mensagem DESTA conversa é do cliente. Comparação bruta, só da conversa (um canal) —
 * o filtro e o selo "aguardando" da tela usam a regra única (`lib/esperando.ts`), não esta.
 */
export function aguardandoResposta(c: Pick<ConversaInbox, 'ultima_recebida_at' | 'ultima_enviada_at'>): boolean {
  if (!c.ultima_recebida_at) return false
  if (!c.ultima_enviada_at) return true
  return new Date(c.ultima_recebida_at).getTime() > new Date(c.ultima_enviada_at).getTime()
}

// ── Sem resposta há mais de 72 h ────────────────────────────────────────────

/** A janela do "esperando resposta" (a mesma da função `esperando_resposta`). */
export const JANELA_ESPERANDO_MS = 72 * 3_600_000
const FALHAS_DE_ENVIO = ['falhou', 'falha_envio']

type LinhaAntiga = Pick<ConversaInbox, 'id' | 'contato_id' | 'filial_id' | 'ultima_mensagem_at' | 'ultima_recebida_at' | 'ultima_enviada_at'>
type Envio = { contato_id: number | null; filial_id: number | null; created_at: string; status_entrega: string | null }

/**
 * Das conversas (todas as da sessão), as de quem está sem resposta há mais de 72 h. Pura, para testar.
 * Por contato + loja (canais juntos): a última do cliente é anterior à janela e nenhum envio da loja
 * depois dela deu certo. Entra a conversa do canal em que o cliente falou por último.
 * `envios` = os envios da loja posteriores a alguma última do cliente que só têm envio FALHO na
 * conversa (o app não sabe pela coluna `ultima_enviada_at`, que o gatilho grava mesmo se falhou).
 */
export function conversasAntigas(linhas: LinhaAntiga[], envios: Envio[], agora: number): LinhaAntiga[] {
  const porChave = new Map<string, { rec: number; env: number; conversa: LinhaAntiga }>()
  for (const c of linhas) {
    if (c.contato_id == null) continue
    const k = `${c.contato_id}:${c.filial_id ?? 0}`
    const rec = c.ultima_recebida_at ? new Date(c.ultima_recebida_at).getTime() : -Infinity
    const env = c.ultima_enviada_at ? new Date(c.ultima_enviada_at).getTime() : -Infinity
    const g = porChave.get(k)
    if (!g) { porChave.set(k, { rec, env, conversa: c }); continue }
    if (rec > g.rec) { g.rec = rec; g.conversa = c }
    g.env = Math.max(g.env, env)
  }
  const enviosPorChave = new Map<string, Envio[]>()
  for (const e of envios) {
    const k = `${e.contato_id}:${e.filial_id ?? 0}`
    enviosPorChave.set(k, [...(enviosPorChave.get(k) ?? []), e])
  }
  const out: LinhaAntiga[] = []
  for (const [k, g] of porChave) {
    if (!Number.isFinite(g.rec) || g.rec >= agora - JANELA_ESPERANDO_MS) continue
    if (g.env >= g.rec) {
      // A coluna diz que a loja mandou depois; vale só se algum desses envios não falhou.
      const lista = enviosPorChave.get(k)
      if (!lista) continue
      const respondeu = lista.some((e) => new Date(e.created_at).getTime() >= g.rec && !FALHAS_DE_ENVIO.includes(e.status_entrega ?? ''))
      if (respondeu) continue
    }
    out.push(g.conversa)
  }
  return out
}

async function lerAntigas(db: Db): Promise<LinhaAntiga[]> {
  const linhas: LinhaAntiga[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('conversas')
      .select('id, contato_id, filial_id, ultima_mensagem_at, ultima_recebida_at, ultima_enviada_at')
      .not('ultima_recebida_at', 'is', null).order('id').range(de, de + 999)
    if (error) throw new Error(error.message)
    linhas.push(...((data ?? []) as LinhaAntiga[]))
    if ((data ?? []).length < 1000) break
  }
  // Quem só tem envio FALHO depois da última do cliente: poucos (falha é rara). Lê os envios deles.
  const { data: falhas } = await db.from('mensagens').select('contato_id, filial_id')
    .eq('direcao', 'enviada').in('status_entrega', FALHAS_DE_ENVIO).limit(1000)
  const comFalha = [...new Set(((falhas ?? []) as { contato_id: number | null }[]).map((f) => f.contato_id).filter((x): x is number => x != null))]
  let envios: Envio[] = []
  if (comFalha.length) {
    const { data } = await db.from('mensagens').select('contato_id, filial_id, created_at, status_entrega')
      .eq('direcao', 'enviada').in('contato_id', comFalha)
      .gte('created_at', new Date(Date.now() - 400 * 86_400_000).toISOString()).limit(5000)
    envios = (data ?? []) as Envio[]
  }
  return conversasAntigas(linhas, envios, Date.now())
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
  db: Db, f: FiltrosInbox, canais: CanalInbox[], cursor?: Cursor | null, esperando?: MapaEsperando,
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
  // Filtro de etiqueta = filtro no contato embutido: precisa do !inner para cortar a conversa.
  const comEtiqueta = filtroEtiquetasAtivo(f.etiquetas)
  const embedContato = comResp
    ? `contato:contatos!inner(${COLUNAS_CONTATO}, negocios!negocios_contato_id_fkey!inner(responsavel_id))`
    : comEtiqueta ? `contato:contatos!inner(${COLUNAS_CONTATO})` : `contato:contatos(${COLUNAS_CONTATO})`

  /** `string`, não literal: o parser de tipos do supabase-js estoura com relação embutida. */
  const completa: string = `${COLUNAS_CONVERSA}, ${embedContato}, canal:canais(${COLUNAS_CANAL})`
  const consulta = (selecao: string, desde: Cursor | null, limite: number, soIds?: number[]) => {
    // Tipo solto de propósito: o construtor reatribuído com relação embutida estoura o tsc (TS2589).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from('conversas').select(selecao).not('ultima_mensagem_at', 'is', null)
    if (soIds) q = q.in('id', soIds)
    if (idsCanal) q = q.in('canal_id', idsCanal)
    if (f.naoLidas) q = q.gt('nao_lidas', 0)
    if (contatos) q = q.in('contato_id', contatos)
    if (comResp) q = f.responsavel === 'nenhum'
      ? q.is('contato.negocios.responsavel_id', null)
      : q.eq('contato.negocios.responsavel_id', f.responsavel as string)
    if (comEtiqueta && f.etiquetas.com.length) q = q.overlaps('contato.etiqueta_ids', f.etiquetas.com)
    if (comEtiqueta && f.etiquetas.sem.length) q = q.not('contato.etiqueta_ids', 'ov', `{${f.etiquetas.sem.join(',')}}`)
    if (desde) q = q.or(filtroDoCursor(desde))
    return q.order('ultima_mensagem_at', { ascending: false }).order('id', { ascending: false }).limit(limite)
  }
  const limpar = (linhas: unknown[]) => (linhas as (ConversaInbox & { contato: (ContatoInbox & { negocios?: unknown }) | null })[])
    .map(({ contato, ...c }) => ({ ...c, contato: contato ? { id: contato.id, nome: contato.nome, telefone: contato.telefone, instagram: contato.instagram, foto_url: contato.foto_url, etiqueta_ids: contato.etiqueta_ids ?? [] } : null }))

  if (f.antigos) {
    /**
     * Sem resposta há mais de 72 h: a lista sai das conversas (colunas mínimas, a RLS limita à
     * loja), em ordem de última mensagem; a página traz só as 40 da vez, completas.
     */
    let antigas = await lerAntigas(db)
    if (contatos) antigas = antigas.filter((c) => contatos!.includes(c.contato_id as number))
    const ordem = (a: Pick<ConversaInbox, 'id' | 'ultima_mensagem_at'>, b: Pick<ConversaInbox, 'id' | 'ultima_mensagem_at'>) =>
      (b.ultima_mensagem_at ?? '').localeCompare(a.ultima_mensagem_at ?? '') || b.id - a.id
    antigas.sort(ordem)
    if (cursor) antigas = antigas.filter((c) => (c.ultima_mensagem_at ?? '') < cursor.momento
      || ((c.ultima_mensagem_at ?? '') === cursor.momento && c.id < cursor.id))
    const ids = antigas.map((c) => c.id)
    // Canal, não lidas e responsável continuam valendo: a consulta completa os aplica, 200 ids por vez.
    const itens: ConversaInbox[] = []
    let i = 0
    while (i < ids.length && itens.length <= POR_PAGINA) {
      const { data, error } = await consulta(completa, null, 200, ids.slice(i, i + 200))
      if (error) throw new Error(error.message)
      itens.push(...limpar(data ?? []))
      i += 200
    }
    itens.sort(ordem)
    const pagina = itens.slice(0, POR_PAGINA)
    const ultima = pagina[pagina.length - 1]
    const temMais = itens.length > POR_PAGINA || (itens.length === POR_PAGINA && i < ids.length)
    return { itens: pagina, proximo: temMais && ultima ? { momento: ultima.ultima_mensagem_at as string, id: ultima.id } : null }
  }

  if (!f.aguardando) {
    const { data, error } = await consulta(completa, cursor ?? null, POR_PAGINA)
    if (error) throw new Error(error.message)
    const itens = limpar(data ?? [])
    const ultima = itens[itens.length - 1]
    return { itens, proximo: itens.length === POR_PAGINA && ultima ? { momento: ultima.ultima_mensagem_at as string, id: ultima.id } : null }
  }

  /**
   * "Aguardando resposta" = a regra única (`esperando_resposta`, 11/11/2026): última do cliente nas
   * últimas 72 h, canais da loja juntos, sem resposta da loja depois (envio que falhou não conta).
   * O banco devolve os contatos + lojas que esperam (poucas centenas); daqui vêm só as conversas
   * deles, e entra a do canal em que o cliente falou por último. Antes: varredura em lotes de 500
   * comparando duas colunas de cada conversa, por canal e sem janela.
   */
  const mapa = esperando ?? await lerEsperando(db)
  const quem = [...new Set([...mapa.porContatoLoja.keys()].map((k) => Number(k.split(':')[0])))]
  const alvo = contatos ? quem.filter((id) => contatos!.includes(id)) : quem
  if (!alvo.length) return { itens: [], proximo: null }
  contatos = alvo
  const { data, error } = await consulta(completa, cursor ?? null, TETO_AGUARDANDO)
  if (error) throw new Error(error.message)
  const achadas = limpar(data ?? []).filter((c) => conversaEsperando(c, mapa))
  const itens = achadas.slice(0, POR_PAGINA)
  const ultima = itens[itens.length - 1]
  return { itens, proximo: achadas.length > POR_PAGINA && ultima ? { momento: ultima.ultima_mensagem_at as string, id: ultima.id } : null }
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
export interface NotaInbox { id: number; texto: string; por_usuario: string | null; em: string; editada_em?: string | null }

export async function notasDaConversa(db: Db, conversaId: number): Promise<NotaInbox[]> {
  const { data } = await db.from('eventos').select('id, dados, por_usuario, em')
    .eq('tipo', TIPO_NOTA).eq('entidade', 'conversa').eq('entidade_id', conversaId).order('em')
  return ((data ?? []) as { id: number; dados: { texto?: string; editada_em?: string } | null; por_usuario: string | null; em: string }[])
    .map((n) => ({ id: n.id, texto: n.dados?.texto ?? '', por_usuario: n.por_usuario, em: n.em, editada_em: n.dados?.editada_em ?? null }))
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

/**
 * Editar e apagar a nota: só o AUTOR (migração 20261104000400, RLS de `eventos`).
 * Pede as linhas de volta — com RLS, nota de outra pessoa vira 0 linhas sem erro, e
 * a tela tem de dizer que não gravou (lib/linhas-afetadas.ts).
 */
export async function editarNota(db: Db, id: number, texto: string): Promise<void> {
  const t = texto.trim()
  if (!t) throw new Error('A nota não pode ficar vazia.')
  const { data, error } = await db.from('eventos')
    .update({ dados: { texto: t, editada_em: new Date().toISOString() } })
    .eq('id', id).eq('tipo', TIPO_NOTA).select('id')
  if (error) throw new Error(error.message)
  if (nadaGravado(data)) throw new Error('Só quem escreveu a nota pode editá-la.')
}

export async function apagarNota(db: Db, id: number): Promise<void> {
  const { data, error } = await db.from('eventos').delete().eq('id', id).eq('tipo', TIPO_NOTA).select('id')
  if (error) throw new Error(error.message)
  if (nadaGravado(data)) throw new Error('Só quem escreveu a nota pode apagá-la.')
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
