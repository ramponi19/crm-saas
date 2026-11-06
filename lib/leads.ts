import type { SupabaseClient } from '@supabase/supabase-js'
import { telefoneE164 } from '@/lib/telefone-e164'

/**
 * LEADS — a camada única sobre o core (último lote das views, 05/11/2026).
 *
 * "Lead" não é tabela: é o NEGÓCIO (`negocios`) de um CONTATO (`contatos`) numa
 * etapa (`funil_etapas`), com a conversa (`conversas`/`mensagens`) do contato na
 * loja. Até aqui a view `leads` juntava as quatro e o gatilho `compat_leads_iud`
 * (INSTEAD OF, SECURITY DEFINER) separava de volta. A view caiu; esta camada lê e
 * grava as tabelas.
 *
 * ONDE CADA CAMPO MORA
 *   negocios                 id, empresa_id, filial_id, contato_id, funil_id, etapa_id,
 *                            responsavel_id, valor_estimado, status, ativo (gerada),
 *                            created_at, ordem (= kanban_ordem), entrou_etapa_em
 *                            (= data_transferencia_funil), devolucoes, devolvido_em,
 *                            motivo_perda_id, perdido_em
 *   negocios.dados           produto_interessado, _interesse, _anuncio
 *   negocios.dados._lead     ativo (gravar AQUI; a coluna `ativo` acompanha), primeira_msg,
 *                            ultima_tratativa, responsavel_desde, convertido_em, origem,
 *                            origem_id
 *   funil_etapas.slug        kanban_status
 *   contatos                 nome, telefone, instagram, origem, origem_id, foto_url, observacoes
 *   conversas (do contato    ultima_mensagem_at, ultima_recebida_at, ultima_enviada_at,
 *   na loja)                 nao_lidas (= msgs_nao_lidas) — só o negócio PRINCIPAL do
 *                            contato na loja (ativo primeiro, o mais novo) leva a conversa,
 *                            como a view fazia: `conversasDosLeads`
 *
 * FILTROS DE SEMPRE
 *   .eq('ativo', true)                         o "zerar do funil" (coluna gerada)
 *   etapa: `etapa:funil_etapas!etapa_id!inner(slug)` + `.eq('etapa.slug', 'novo')`
 *   nome/telefone: `contato:contatos!contato_id!inner(nome)` + `.ilike('contato.nome', ...)`
 *
 * EMBED de quem aponta para o negócio (tarefas.lead_id, visitas.lead_id...):
 *   `leads:negocios!tarefas_lead_id_fkey(...contatos!contato_id(nome, telefone))`
 *   — a chave `leads` e o formato `{ nome, telefone }` ficam iguais (`embedLead`).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>
type Json = Record<string, unknown>

/** Colunas do negócio + contato + etapa que formam o lead das telas. */
export const COLUNAS_LEAD =
  'id, empresa_id, filial_id, contato_id, funil_id, etapa_id, responsavel_id, valor_estimado, status, ativo, created_at, ' +
  'ordem, entrou_etapa_em, devolucoes, devolvido_em, motivo_perda_id, perdido_em, dados, ' +
  'contato:contatos!contato_id(nome, telefone, instagram, origem, origem_id, foto_url, observacoes), ' +
  'etapa:funil_etapas!etapa_id(slug)'

export interface Lead {
  id: number
  empresa_id: number
  filial_id: number | null
  contato_id: number
  funil_id: number | null
  etapa_id: number | null
  responsavel_id: string | null
  valor_estimado: number | null
  status: string
  ativo: boolean
  created_at: string
  kanban_status: string
  kanban_ordem: number
  data_transferencia_funil: string | null
  devolucoes: number
  devolvido_em: string | null
  motivo_perda_id: number | null
  perdido_em: string | null
  nome: string | null
  telefone: string | null
  instagram: string | null
  origem: string | null
  origem_id: string | null
  foto_url: string | null
  observacoes: string | null
  produto_interessado: string | null
  interesse: unknown
  anuncio: unknown
  primeira_msg: string | null
  ultima_tratativa: string | null
  responsavel_desde: string | null
  convertido_em: number | null
}

const texto = (v: unknown) => (v == null || v === '' ? null : String(v))
const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/** A linha de `negocios` (com `contato` e `etapa` embutidos, como em COLUNAS_LEAD) na forma de lead. */
export function leadDoNegocio(r: Json): Lead {
  const dados = (r.dados ?? {}) as Json
  const lead = (dados._lead ?? {}) as Json
  const c = (um(r.contato as Json | Json[] | null) ?? {}) as Json
  const e = (um(r.etapa as Json | Json[] | null) ?? {}) as Json
  return {
    id: r.id as number,
    empresa_id: r.empresa_id as number,
    filial_id: (r.filial_id as number | null) ?? null,
    contato_id: r.contato_id as number,
    funil_id: (r.funil_id as number | null) ?? null,
    etapa_id: (r.etapa_id as number | null) ?? null,
    responsavel_id: (r.responsavel_id as string | null) ?? null,
    valor_estimado: r.valor_estimado == null ? null : Number(r.valor_estimado),
    status: String(r.status ?? 'aberto'),
    ativo: r.ativo == null ? lead.ativo !== false : Boolean(r.ativo),
    created_at: String(r.created_at ?? ''),
    kanban_status: texto(e.slug) ?? texto(lead.kanban_status) ?? 'novo',
    kanban_ordem: Number(r.ordem ?? 0),
    data_transferencia_funil: texto(r.entrou_etapa_em),
    devolucoes: Number(r.devolucoes ?? 0),
    devolvido_em: texto(r.devolvido_em),
    motivo_perda_id: (r.motivo_perda_id as number | null) ?? null,
    perdido_em: texto(r.perdido_em),
    nome: texto(c.nome),
    telefone: texto(c.telefone),
    instagram: texto(c.instagram),
    origem: texto(c.origem),
    origem_id: texto(c.origem_id),
    foto_url: texto(c.foto_url),
    observacoes: texto(c.observacoes),
    produto_interessado: texto(dados.produto_interessado),
    interesse: dados._interesse ?? null,
    anuncio: dados._anuncio ?? null,
    primeira_msg: texto(lead.primeira_msg),
    ultima_tratativa: texto(lead.ultima_tratativa),
    responsavel_desde: texto(lead.responsavel_desde),
    convertido_em: lead.convertido_em == null ? null : Number(lead.convertido_em),
  }
}

/**
 * Embed do lead para quem aponta para `negocios` por `fk` (ex.: 'tarefas_lead_id_fkey').
 * Devolve `leads: { nome, telefone }` como a view devolvia.
 */
export function embedLead(fk: string, colunas = 'nome', chave = 'leads'): string {
  return `${chave}:negocios!${fk}(...contatos!contato_id(${colunas}))`
}

export interface ConversaDoLead {
  ultima_mensagem_at: string | null
  ultima_recebida_at: string | null
  ultima_enviada_at: string | null
  msgs_nao_lidas: number
}

const SEM_CONVERSA: ConversaDoLead = { ultima_mensagem_at: null, ultima_recebida_at: null, ultima_enviada_at: null, msgs_nao_lidas: 0 }
const chave = (contato: number, filial: number | null) => `${contato}:${filial ?? -1}`
const maior = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

async function emLotes<T>(ids: number[], f: (lote: number[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 200) out.push(...(await f(ids.slice(i, i + 200))))
  return out
}

/** O negócio principal do contato na loja: ativo primeiro, depois o mais novo (id desempata). */
function melhorQue(n: { id: number; created_at: string; ativo?: boolean | null }, p: { id: number; created_at: string; ativo?: boolean | null }): boolean {
  const na = n.ativo !== false, pa = p.ativo !== false
  if (na !== pa) return na
  return n.created_at > p.created_at || (n.created_at === p.created_at && n.id > p.id)
}

/**
 * UM POR CONTATO E LOJA (06/11/2026). Um contato fundido (Instagram + WhatsApp) pode
 * ficar com dois negócios abertos na mesma loja, e as listas que buscam NEGÓCIO
 * (busca do topo/⌘K, escolher lead na tarefa e na agenda) mostravam a pessoa duas
 * vezes. Fica o principal — a mesma regra de `quadro_base` e de `conversasDosLeads` —,
 * na posição em que o contato apareceu primeiro.
 */
export function umPorContatoELoja<T extends { id: number; contato_id: number; filial_id: number | null; created_at: string; ativo?: boolean | null }>(lista: T[]): T[] {
  const ordem: string[] = []
  const melhor = new Map<string, T>()
  for (const n of lista) {
    const k = chave(n.contato_id, n.filial_id)
    const p = melhor.get(k)
    if (!p) { ordem.push(k); melhor.set(k, n) } else if (melhorQue(n, p)) melhor.set(k, n)
  }
  return ordem.map((k) => melhor.get(k)!)
}

/**
 * A conversa de cada negócio, como a view `leads` calculava: soma das conversas do
 * contato NA LOJA do negócio, só para o negócio principal (ativo primeiro, o mais
 * novo). Os outros negócios do mesmo contato na mesma loja ficam sem conversa —
 * senão a mesma não lida contaria duas vezes.
 */
export async function conversasDosLeads(
  db: Db, empresaId: number, negocios: { id: number; contato_id: number; filial_id: number | null }[],
): Promise<Map<number, ConversaDoLead>> {
  const out = new Map<number, ConversaDoLead>()
  const contatos = [...new Set(negocios.map((n) => n.contato_id).filter(Boolean))]
  if (!contatos.length) return out

  const todos = await emLotes(contatos, async (lote) => {
    const { data, error } = await db.from('negocios').select('id, contato_id, filial_id, ativo, created_at')
      .eq('empresa_id', empresaId).in('contato_id', lote)
    if (error) throw new Error(`negócios dos contatos: ${error.message}`)
    return (data ?? []) as { id: number; contato_id: number; filial_id: number | null; ativo: boolean; created_at: string }[]
  })
  const principal = new Map<string, (typeof todos)[number]>()
  for (const n of todos) {
    const k = chave(n.contato_id, n.filial_id)
    const p = principal.get(k)
    const melhor = !p
      || (n.ativo && !p.ativo)
      || (n.ativo === p.ativo && (n.created_at > p.created_at || (n.created_at === p.created_at && n.id > p.id)))
    if (melhor) principal.set(k, n)
  }

  const convs = await emLotes(contatos, async (lote) => {
    const { data, error } = await db.from('conversas')
      .select('contato_id, filial_id, nao_lidas, ultima_mensagem_at, ultima_recebida_at, ultima_enviada_at')
      .eq('empresa_id', empresaId).in('contato_id', lote)
    if (error) throw new Error(`conversas dos contatos: ${error.message}`)
    return (data ?? []) as { contato_id: number; filial_id: number | null; nao_lidas: number | null; ultima_mensagem_at: string | null; ultima_recebida_at: string | null; ultima_enviada_at: string | null }[]
  })
  const porChave = new Map<string, ConversaDoLead>()
  for (const c of convs) {
    const k = chave(c.contato_id, c.filial_id)
    const a = porChave.get(k) ?? { ...SEM_CONVERSA }
    porChave.set(k, {
      ultima_mensagem_at: maior(a.ultima_mensagem_at, c.ultima_mensagem_at),
      ultima_recebida_at: maior(a.ultima_recebida_at, c.ultima_recebida_at),
      ultima_enviada_at: maior(a.ultima_enviada_at, c.ultima_enviada_at),
      msgs_nao_lidas: a.msgs_nao_lidas + Number(c.nao_lidas ?? 0),
    })
  }

  for (const n of negocios) {
    const k = chave(n.contato_id, n.filial_id)
    out.set(n.id, principal.get(k)?.id === n.id ? (porChave.get(k) ?? { ...SEM_CONVERSA }) : { ...SEM_CONVERSA })
  }
  return out
}

/**
 * Leads ativos para escolher numa lista (tarefa, agenda): os de conversa mais
 * recente primeiro, completando com os mais novos. Era `leads` ordenado por
 * `ultima_mensagem_at`. A RLS de quem chama vale (loja e papel).
 */
export async function leadsParaEscolher(db: Db, empresaId: number, limite = 200): Promise<{ id: number; nome: string | null }[]> {
  const { data: convs } = await db.from('conversas').select('contato_id, filial_id, ultima_mensagem_at')
    .eq('empresa_id', empresaId).not('ultima_mensagem_at', 'is', null)
    .order('ultima_mensagem_at', { ascending: false }).limit(limite * 2)
  const ordem = new Map<string, number>()
  ;((convs ?? []) as { contato_id: number; filial_id: number | null }[]).forEach((c, i) => {
    const k = chave(c.contato_id, c.filial_id)
    if (!ordem.has(k)) ordem.set(k, i)
  })
  const contatos = [...new Set(((convs ?? []) as { contato_id: number }[]).map((c) => c.contato_id))]

  type Linha = { id: number; contato_id: number; filial_id: number | null; created_at: string; contato: { nome: string | null } | null }
  const doContato = contatos.length ? await emLotes(contatos, async (lote) => {
    const { data } = await db.from('negocios').select('id, contato_id, filial_id, created_at, contato:contatos!contato_id(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true).in('contato_id', lote)
    return (data ?? []) as unknown as Linha[]
  }) : []
  const fim = Number.MAX_SAFE_INTEGER
  doContato.sort((a, b) => (ordem.get(chave(a.contato_id, a.filial_id)) ?? fim) - (ordem.get(chave(b.contato_id, b.filial_id)) ?? fim)
    || b.created_at.localeCompare(a.created_at))

  // Uma linha por contato e loja (o negócio principal): o contato fundido com dois
  // negócios abertos na mesma loja aparecia duas vezes na lista.
  const vistos = new Set<string>()
  const out: { id: number; nome: string | null }[] = []
  for (const n of umPorContatoELoja(doContato)) {
    if (out.length >= limite) break
    vistos.add(chave(n.contato_id, n.filial_id)); out.push({ id: n.id, nome: um(n.contato)?.nome ?? null })
  }
  if (out.length < limite) {
    const { data: novos } = await db.from('negocios').select('id, contato_id, filial_id, created_at, contato:contatos!contato_id(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true).order('created_at', { ascending: false }).limit(limite)
    for (const n of umPorContatoELoja((novos ?? []) as unknown as Linha[])) {
      if (out.length >= limite) break
      const k = chave(n.contato_id, n.filial_id)
      if (vistos.has(k)) continue
      vistos.add(k); out.push({ id: n.id, nome: um(n.contato)?.nome ?? null })
    }
  }
  return out
}

/**
 * As mensagens do lead (as mais novas primeiro): as do contato NA LOJA do negócio,
 * como a view `lead_mensagens` atribuía. A RLS de quem chama vale.
 */
export async function mensagensDoLead<T = Json>(db: Db, negocioId: number, colunas: string, limite = 50): Promise<T[]> {
  const { data: n } = await db.from('negocios').select('contato_id, filial_id').eq('id', negocioId).maybeSingle()
  if (!n) return []
  let q = db.from('mensagens').select(colunas).eq('contato_id', n.contato_id as number)
  q = n.filial_id == null ? q.is('filial_id', null) : q.eq('filial_id', n.filial_id as number)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limite)
  if (error) throw new Error(`mensagens do lead ${negocioId}: ${error.message}`)
  return (data ?? []) as unknown as T[]
}

/** Lê um lead pelo id (a RLS de quem chama vale). */
export async function lerLead(db: Db, id: number): Promise<Lead | null> {
  const { data, error } = await db.from('negocios').select(COLUNAS_LEAD).eq('id', id).maybeSingle()
  if (error) throw new Error(`ler lead ${id}: ${error.message}`)
  return data ? leadDoNegocio(data as unknown as Json) : null
}

// ── Gravar ─────────────────────────────────────────────────────────────────

export interface NovoLead {
  /** O contato já conhecido (o cliente que entra no funil). Quem chama confere a empresa. */
  contato_id?: number | null
  nome?: string | null
  telefone?: string | null
  email?: string | null
  instagram?: string | null
  /** Canal ou forma de entrada ('manual', 'site', 'portal', 'whatsapp'...). */
  origem?: string | null
  /** Identidade no canal (telefone do WhatsApp, IGSID). Só com origem de canal. */
  origem_id?: string | null
  filial_id?: number | null
  funil_id?: number | null
  kanban_status?: string | null
  responsavel_id?: string | null
  valor_estimado?: number | null
  produto_interessado?: string | null
  observacoes?: string | null
  primeira_msg?: string | null
  interesse?: unknown
  anuncio?: unknown
}

export type ResultadoLead = { id: number; contato_id: number; error?: never; status?: never } | { error: string; status: number; id?: never; contato_id?: never }

const CANAIS = ['whatsapp', 'instagram', 'messenger']

/**
 * O contato do lead, pela mesma regra do gatilho da view: o telefone (E.164) na
 * empresa, depois a identidade do canal; sem nenhum, cria. Só pelo serviço — a
 * busca precisa enxergar a empresa inteira (o vendedor de uma loja cadastrando um
 * telefone que a outra loja já tem marca o mesmo contato, sem bater no índice único).
 */
async function contatoDoLead(svc: Db, empresaId: number, l: NovoLead): Promise<{ id: number } | { error: string; status: number }> {
  if (l.contato_id) {
    const { data } = await svc.from('contatos').select('id').eq('id', l.contato_id).eq('empresa_id', empresaId).maybeSingle()
    return data ? { id: data.id as number } : { error: 'contato não encontrado', status: 404 }
  }
  const e164 = telefoneE164(l.telefone)
  if (e164) {
    const { data } = await svc.from('contatos').select('id').eq('empresa_id', empresaId).eq('telefone_e164', e164).limit(1)
    if (data?.[0]) return { id: data[0].id as number }
  }
  if (l.origem && l.origem_id) {
    const { data } = await svc.from('contato_identidades').select('contato_id')
      .eq('empresa_id', empresaId).eq('canal_tipo', l.origem).eq('external_id', l.origem_id).limit(1)
    if (data?.[0]) return { id: data[0].contato_id as number }
  }
  const { data: novo, error } = await svc.from('contatos').insert({
    empresa_id: empresaId, filial_id: l.filial_id ?? null, nome: l.nome ?? null, telefone: l.telefone ?? null,
    telefone_e164: e164, email: l.email ?? null, instagram: l.instagram ?? null, origem: l.origem ?? null,
    origem_id: l.origem_id ?? null, responsavel_id: l.responsavel_id ?? null, observacoes: l.observacoes ?? null, ativo: true,
  }).select('id').single()
  if (error) {
    // Corrida no índice único do telefone: a outra gravação criou o contato.
    if (error.code === '23505' && e164) {
      const { data } = await svc.from('contatos').select('id').eq('empresa_id', empresaId).eq('telefone_e164', e164).limit(1)
      if (data?.[0]) return { id: data[0].id as number }
    }
    return { error: `criar contato: ${error.message}`, status: 500 }
  }
  return { id: novo.id as number }
}

/**
 * Cria o lead (contato + negócio), como o INSERT na view fazia:
 *   - lead que vem de CANAL (origem whatsapp/instagram/messenger com origem_id) usa o
 *     negócio aberto do contato na loja, ou reabre o mais recente, ou cria
 *     (`core_negocio_do_canal`, com as travas) — não duplica quem volta;
 *   - lead criado à mão (ou por formulário, portal, agendamento) cria negócio novo:
 *     é decisão de quem cadastrou;
 *   - `kanban_status` vira a etapa de mesmo slug no funil (o padrão, se não vier);
 *     etapa ganho/perdido dá o status;
 *   - o limite do plano é do banco (gatilho `negocios_limite`): 402 com LEAD_LIMIT_REACHED.
 * Só pelo serviço. Quem chama confere a sessão, a empresa e a loja antes.
 */
export async function criarLead(svc: Db, empresaId: number, l: NovoLead): Promise<ResultadoLead> {
  const contato = await contatoDoLead(svc, empresaId, l)
  if ('error' in contato) return contato
  if (l.origem && l.origem_id) {
    const { error } = await svc.from('contato_identidades')
      .insert({ empresa_id: empresaId, contato_id: contato.id, canal_tipo: l.origem, external_id: l.origem_id })
    if (error && error.code !== '23505') return { error: `identidade: ${error.message}`, status: 500 }
  }

  if (l.origem && CANAIS.includes(l.origem) && l.origem_id) {
    const { data, error } = await svc.rpc('core_negocio_do_canal', {
      p_empresa: empresaId, p_contato: contato.id, p_filial: l.filial_id ?? null, p_primeira_msg: l.primeira_msg ?? null,
      p_so_existente: false, p_origem: l.origem, p_origem_id: l.origem_id,
    })
    if (error) return erroDeGravacao(error)
    return { id: data as number, contato_id: contato.id }
  }

  let funilId = l.funil_id ?? null
  if (!funilId) {
    const { data } = await svc.from('funis').select('id').eq('empresa_id', empresaId).eq('padrao', true).eq('interno', false)
      .order('id').limit(1)
    funilId = (data?.[0]?.id as number | undefined) ?? null
  }
  let etapa: { id: number; tipo: string | null } | null = null
  if (funilId) {
    let q = svc.from('funil_etapas').select('id, tipo, slug, ordem').eq('funil_id', funilId)
    q = l.kanban_status ? q.eq('slug', l.kanban_status) : q.order('ordem').order('id')
    const { data } = await q.limit(1)
    etapa = (data?.[0] as { id: number; tipo: string | null } | undefined) ?? null
    if (!etapa && l.kanban_status) {
      const { data: primeira } = await svc.from('funil_etapas').select('id, tipo').eq('funil_id', funilId).order('ordem').order('id').limit(1)
      etapa = (primeira?.[0] as { id: number; tipo: string | null } | undefined) ?? null
    }
  }
  const status = etapa?.tipo === 'ganho' ? 'ganho' : etapa?.tipo === 'perdido' ? 'perdido' : 'aberto'
  const dados: Json = {}
  if (l.produto_interessado) dados.produto_interessado = l.produto_interessado
  if (l.interesse != null) dados._interesse = l.interesse
  if (l.anuncio != null) dados._anuncio = l.anuncio
  const lead: Json = { ativo: true }
  if (l.primeira_msg) lead.primeira_msg = l.primeira_msg
  if (l.origem) lead.origem = l.origem
  if (l.origem_id) lead.origem_id = l.origem_id
  if (l.responsavel_id) lead.responsavel_desde = new Date().toISOString()
  if (!etapa) lead.kanban_status = l.kanban_status ?? 'novo'
  dados._lead = lead

  const { data: neg, error } = await svc.from('negocios').insert({
    empresa_id: empresaId, filial_id: l.filial_id ?? null, contato_id: contato.id, funil_id: funilId, etapa_id: etapa?.id ?? null,
    status, responsavel_id: l.responsavel_id ?? null, valor_estimado: l.valor_estimado ?? null, dados,
    ...(status === 'ganho' ? { ganho_em: new Date().toISOString() } : {}),
    ...(status === 'perdido' ? { perdido_em: new Date().toISOString() } : {}),
  }).select('id').single()
  if (error) return erroDeGravacao(error)
  return { id: neg.id as number, contato_id: contato.id }
}

function erroDeGravacao(error: { message: string; code?: string }): { error: string; status: number } {
  if (error.message?.includes('LEAD_LIMIT_REACHED')) return { error: 'LEAD_LIMIT_REACHED', status: 402 }
  return { error: error.message, status: 500 }
}

/**
 * Funde chaves em `negocios.dados._lead` (ultima_tratativa, convertido_em...). Lê e
 * grava o JSON inteiro: para marcos de baixa frequência. Devolve as linhas gravadas
 * (0 = negócio não visível ou inexistente).
 */
export async function marcarNoLead(db: Db, id: number, patch: Json, extra: Json = {}): Promise<number> {
  const { data: atual, error: eLer } = await db.from('negocios').select('dados').eq('id', id).maybeSingle()
  if (eLer) throw new Error(`ler negócio ${id}: ${eLer.message}`)
  if (!atual) return 0
  const dados = (atual.dados ?? {}) as Json
  const novo = { ...dados, _lead: { ...((dados._lead ?? {}) as Json), ...patch } }
  const { data, error } = await db.from('negocios').update({ dados: novo, ...extra }).eq('id', id).select('id')
  if (error) throw new Error(`gravar negócio ${id}: ${error.message}`)
  return data?.length ?? 0
}

/**
 * Mensagem que não veio da Meta (formulário do site, portal, nota do vendedor
 * registrada como mensagem): pela `mensagem_registrar`, presa ao negócio. Só pelo
 * serviço (a função não é exposta a anon/authenticated).
 */
export async function registrarMensagemDoLead(svc: Db, empresaId: number, negocioId: number, m: {
  direcao: 'recebida' | 'enviada'; conteudo: string; origem: string; tipo?: string; lida?: boolean
  usuario_id?: string | null; midia_url?: string | null; status_entrega?: string | null
}): Promise<{ id: number | null; error?: string }> {
  const { data, error } = await svc.rpc('mensagem_registrar', {
    p_empresa: empresaId, p_canal_id: null, p_external_id: null,
    p_dados: { lead_id: negocioId, tipo: 'texto', lida: m.direcao === 'enviada', ...m },
  })
  if (error) return { id: null, error: error.message }
  return { id: (data as number | null) ?? null }
}
