import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * POR ONDE RESPONDER ESTE CLIENTE, NESTA LOJA (13/11/2026, itens 3 e 4 do levantamento de
 * multinúmero).
 *
 * Até aqui o card escolhia o canal de envio por `contatos.origem` — o canal por onde o contato
 * chegou à empresa pela PRIMEIRA vez, gravado à mão com qualquer grafia ("WhatsApp", "Loja
 * física"). Quem chegou pelo Instagram e hoje escreve no WhatsApp recebia a resposta no Direct;
 * origem fora do padrão virava anotação sem ninguém saber. E o servidor ainda respondia pelo
 * "WhatsApp da loja" (o conectado por último), não pelo número em que o cliente escreveu.
 *
 * A regra agora é a CONVERSA. A origem continua existindo só como atribuição.
 *
 *   1. o canal da última mensagem RECEBIDA do cliente nesta loja (com canal gravado);
 *   2. senão, um canal ativo da loja do MESMO TIPO da última conversa (a conversa antiga, de
 *      antes de as mensagens guardarem o canal, diz o tipo pela `origem` da mensagem);
 *   3. senão, um canal ativo da loja por onde o cliente pode ser alcançado (WhatsApp com
 *      telefone; Instagram/Messenger com identidade naquela conta ou sem conta);
 *   4. senão, SEM CANAL: o card avisa antes que o texto vira anotação e não chega ao cliente.
 *
 * Os passos 2 e 3 só valem se o cliente tem ALGUMA conversa nesta loja. Contato sem conversa
 * nenhuma (cadastro à mão, atendimento presencial) cai direto em "sem canal": mensagem livre
 * para quem nunca escreveu seria recusada pela Meta, e anotar era o que o card já fazia.
 *
 * Canal "da loja" = `filial_id` igual à loja ou nulo (o da rede, como o Messenger da JM). A
 * Edge confere a mesma coisa antes de enviar (supabase/functions/webhook-leads/canal-resposta.ts).
 *
 * Feito para ser reutilizado (a IA do card vai pedir "por onde respondo?"): `decidirCanal` é
 * pura e testada; `resolverCanalDaConversa` só lê o banco com a sessão de quem pergunta (RLS).
 */

export type TipoCanal = 'whatsapp' | 'instagram' | 'messenger'
export const TIPOS_CANAL: readonly TipoCanal[] = ['whatsapp', 'instagram', 'messenger']

/** Janela de atendimento do WhatsApp: 24 h da última mensagem do cliente NAQUELE número. */
export const JANELA_24H_MS = 24 * 60 * 60 * 1000

export type MotivoCanal = 'ultima_recebida' | 'mesmo_tipo_da_ultima_conversa' | 'canal_ativo_da_loja' | 'sem_canal'

export interface CanalDaConversa {
  canalId: number
  tipo: TipoCanal
  /** "WhatsApp ·2028", "Instagram · @conta", "Messenger · Página". */
  rotulo: string
  /** Número ou conta, curto ("2028", "@conta"); nulo se o canal não tem nome gravado. */
  identificacao: string | null
  filialId: number | null
  /** Ativo e da loja (ou da rede): só esses podem enviar. */
  podeResponder: boolean
  /** O cliente tem conversa neste canal, nesta loja. */
  temConversa: boolean
  /** Última mensagem do cliente NESTE canal (ISO), ou nulo. */
  ultimaRecebidaEm: string | null
  /** Só WhatsApp tem janela; Instagram e Messenger: 'nao_se_aplica'. */
  janela24h: 'aberta' | 'fechada' | 'nao_se_aplica'
  /** Quando a janela fecha (ISO), se está aberta. */
  janelaFechaEm: string | null
}

export interface ResolucaoCanal {
  negocioId: number
  lojaId: number | null
  /** O canal pré-selecionado para responder; nulo = sem canal (vira anotação). */
  sugerido: CanalDaConversa | null
  motivo: MotivoCanal
  /** Os canais em que o cliente tem conversa nesta loja, mais o sugerido (se veio de fallback). */
  canais: CanalDaConversa[]
}

// ── Entrada da decisão (o que se lê do banco) ────────────────────────────────

export interface CanalLido {
  id: number
  tipo: string
  nome_exibicao: string | null
  external_id: string | null
  filial_id: number | null
  status: string
}

export interface ConversaLida {
  canal_id: number | null
  ultima_recebida_at: string | null
  ultima_mensagem_at: string | null
}

export interface EntradaDecisao {
  negocioId: number
  lojaId: number | null
  /** Canais ativos da empresa que a sessão enxerga + os das conversas (mesmo inativos). */
  canais: CanalLido[]
  /** Conversas do contato nesta loja. */
  conversas: ConversaLida[]
  /** Última mensagem RECEBIDA nesta loja com canal gravado. */
  ultimaRecebidaComCanal: { canal_id: number } | null
  /** Tipo da conversa mais recente desta loja (pelo canal, ou pela origem da última mensagem). */
  tipoUltimaConversa: TipoCanal | null
  temTelefone: boolean
  /** Identidades do contato: tipo + conta (nula = de antes de guardar a conta). */
  identidades: { canal_tipo: string; canal_id: number | null }[]
}

const NOME: Record<TipoCanal, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger' }

export function tipoCanal(v: string | null | undefined): TipoCanal | null {
  const t = (v ?? '').trim().toLowerCase()
  return (TIPOS_CANAL as readonly string[]).includes(t) ? (t as TipoCanal) : null
}

/** "+55 19 99886-2028 · JM Store" → "2028"; "@conta" → "@conta"; Página → o nome. */
export function identificacaoCurta(tipo: TipoCanal, nome: string | null, externalId: string | null): string | null {
  const n = (nome ?? '').trim()
  if (tipo === 'whatsapp') {
    const digitos = n.split('·')[0].replace(/\D/g, '')
    if (digitos.length >= 4) return digitos.slice(-4)
    const ext = (externalId ?? '').replace(/\D/g, '')
    return ext.length >= 4 ? ext.slice(-4) : null
  }
  if (n) return n
  return externalId ? `…${externalId.slice(-4)}` : null
}

export function rotuloDoCanal(tipo: TipoCanal, identificacao: string | null): string {
  if (!identificacao) return NOME[tipo]
  return tipo === 'whatsapp' ? `${NOME[tipo]} ·${identificacao}` : `${NOME[tipo]} · ${identificacao}`
}

/** Rótulo de mensagem sem canal gravado: o tipo pela origem, sem inventar número. */
export function rotuloSemCanal(origem: string | null | undefined): string {
  const t = tipoCanal(origem)
  if (t) return `${NOME[t]} (canal não registrado)`
  const o = (origem ?? '').trim().toLowerCase()
  if (!o || o === 'manual') return 'Anotação'
  return (origem ?? '').trim()
}

function daLoja(c: CanalLido, lojaId: number | null): boolean {
  return c.filial_id == null || c.filial_id === lojaId
}

/** Decide o canal. Pura: tudo o que precisa vem na entrada; `agora` em ms. */
export function decidirCanal(e: EntradaDecisao, agora: number): ResolucaoCanal {
  const porId = new Map(e.canais.map((c) => [c.id, c]))
  const conversaDoCanal = new Map<number, ConversaLida>()
  for (const cv of e.conversas) if (cv.canal_id != null) conversaDoCanal.set(cv.canal_id, cv)

  const montar = (c: CanalLido): CanalDaConversa | null => {
    const tipo = tipoCanal(c.tipo)
    if (!tipo) return null
    const ident = identificacaoCurta(tipo, c.nome_exibicao, c.external_id)
    const cv = conversaDoCanal.get(c.id) ?? null
    const ultima = cv?.ultima_recebida_at ?? null
    let janela: CanalDaConversa['janela24h'] = 'nao_se_aplica'
    let fecha: string | null = null
    if (tipo === 'whatsapp') {
      const t = ultima ? Date.parse(ultima) : NaN
      const aberta = Number.isFinite(t) && agora - t < JANELA_24H_MS
      janela = aberta ? 'aberta' : 'fechada'
      fecha = aberta ? new Date(t + JANELA_24H_MS).toISOString() : null
    }
    return {
      canalId: c.id, tipo, rotulo: rotuloDoCanal(tipo, ident), identificacao: ident, filialId: c.filial_id,
      podeResponder: c.status === 'ativo' && daLoja(c, e.lojaId), temConversa: !!cv,
      ultimaRecebidaEm: ultima, janela24h: janela, janelaFechaEm: fecha,
    }
  }

  // Canais em que o cliente tem conversa nesta loja, do mais recente para o mais antigo.
  const comConversa: CanalDaConversa[] = []
  const conversasOrdenadas = [...e.conversas].sort((a, b) =>
    (Date.parse(b.ultima_mensagem_at ?? '') || 0) - (Date.parse(a.ultima_mensagem_at ?? '') || 0))
  for (const cv of conversasOrdenadas) {
    if (cv.canal_id == null) continue
    const c = porId.get(cv.canal_id)
    const m = c ? montar(c) : null
    if (m && !comConversa.some((x) => x.canalId === m.canalId)) comConversa.push(m)
  }

  const resposta = (sugerido: CanalDaConversa | null, motivo: MotivoCanal): ResolucaoCanal => ({
    negocioId: e.negocioId, lojaId: e.lojaId, sugerido, motivo,
    canais: sugerido && !comConversa.some((x) => x.canalId === sugerido.canalId) ? [...comConversa, sugerido] : comConversa,
  })

  // 1. A última mensagem do cliente com canal gravado.
  if (e.ultimaRecebidaComCanal) {
    const c = comConversa.find((x) => x.canalId === e.ultimaRecebidaComCanal!.canal_id)
      ?? (porId.get(e.ultimaRecebidaComCanal.canal_id) ? montar(porId.get(e.ultimaRecebidaComCanal.canal_id)!) : null)
    if (c?.podeResponder) return resposta(c, 'ultima_recebida')
  }

  // Sem conversa nenhuma nesta loja: anotação (passos 2 e 3 não se aplicam).
  if (e.conversas.length === 0) return resposta(null, 'sem_canal')

  const alcancavel = (c: CanalLido): boolean => {
    const tipo = tipoCanal(c.tipo)
    if (!tipo) return false
    if (tipo === 'whatsapp') return e.temTelefone || conversaDoCanal.has(c.id)
    return conversaDoCanal.has(c.id)
      || e.identidades.some((i) => tipoCanal(i.canal_tipo) === tipo && (i.canal_id === c.id || i.canal_id == null))
  }
  // Candidatos da loja: ativos, da loja ou da rede, alcançáveis. Prefere quem já tem conversa,
  // depois o da própria loja (o da rede por último), depois a conversa mais recente.
  const candidatos = e.canais
    .filter((c) => c.status === 'ativo' && daLoja(c, e.lojaId) && alcancavel(c))
    .sort((a, b) => {
      const conv = Number(conversaDoCanal.has(b.id)) - Number(conversaDoCanal.has(a.id))
      if (conv) return conv
      const loja = Number(b.filial_id === e.lojaId) - Number(a.filial_id === e.lojaId)
      if (loja) return loja
      const ua = Date.parse(conversaDoCanal.get(a.id)?.ultima_mensagem_at ?? '') || 0
      const ub = Date.parse(conversaDoCanal.get(b.id)?.ultima_mensagem_at ?? '') || 0
      return ub - ua || b.id - a.id
    })

  // 2. Mesmo tipo da última conversa.
  if (e.tipoUltimaConversa) {
    const c = candidatos.find((x) => tipoCanal(x.tipo) === e.tipoUltimaConversa)
    if (c) return resposta(montar(c), 'mesmo_tipo_da_ultima_conversa')
  }
  // 3. Qualquer canal ativo da loja que alcance o cliente (WhatsApp primeiro).
  const ordemTipo = (c: CanalLido) => TIPOS_CANAL.indexOf(tipoCanal(c.tipo) ?? 'messenger')
  const c = [...candidatos].sort((a, b) => ordemTipo(a) - ordemTipo(b))[0]
  if (c) return resposta(montar(c), 'canal_ativo_da_loja')
  return resposta(null, 'sem_canal')
}

// ── Leitura (sessão de quem pergunta; a RLS decide o que ele enxerga) ────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>

/**
 * Lê o que a decisão precisa e decide. `lojaId` padrão = a loja do negócio. Devolve nulo se o
 * negócio não existe ou a sessão não o enxerga.
 */
export async function resolverCanalDaConversa(
  db: Db, leadId: number, lojaId?: number | null, agora = Date.now(),
): Promise<ResolucaoCanal | null> {
  const { data: neg } = await db.from('negocios').select('id, empresa_id, filial_id, contato_id').eq('id', leadId).maybeSingle()
  if (!neg) return null
  const loja = lojaId === undefined ? ((neg.filial_id as number | null) ?? null) : lojaId
  const contatoId = neg.contato_id as number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naLoja = (q: any) => (loja == null ? q.is('filial_id', null) : q.eq('filial_id', loja))

  const [contato, conversas, ultimaComCanal, ultimaQualquer, identidades, ativos] = await Promise.all([
    db.from('contatos').select('telefone').eq('id', contatoId).maybeSingle(),
    naLoja(db.from('conversas').select('canal_id, ultima_recebida_at, ultima_mensagem_at').eq('contato_id', contatoId)),
    naLoja(db.from('mensagens').select('canal_id').eq('contato_id', contatoId).eq('direcao', 'recebida')
      .not('canal_id', 'is', null)).order('created_at', { ascending: false }).limit(1),
    naLoja(db.from('mensagens').select('canal_id, origem').eq('contato_id', contatoId))
      .order('created_at', { ascending: false }).limit(1),
    db.from('contato_identidades').select('canal_tipo, canal_id').eq('contato_id', contatoId),
    db.from('canais').select('id, tipo, nome_exibicao, external_id, filial_id, status')
      .eq('empresa_id', neg.empresa_id as number).eq('status', 'ativo'),
  ])

  const convs = (conversas.data ?? []) as ConversaLida[]
  const canais = new Map<number, CanalLido>(((ativos.data ?? []) as CanalLido[]).map((c) => [c.id, c]))
  // Canais das conversas que não vieram como ativos (inativos ou de outra loja): entram para
  // o rótulo, nunca para enviar.
  const faltam = convs.map((c) => c.canal_id).filter((id): id is number => id != null && !canais.has(id))
  if (faltam.length) {
    const { data } = await db.from('canais').select('id, tipo, nome_exibicao, external_id, filial_id, status').in('id', faltam)
    for (const c of (data ?? []) as CanalLido[]) canais.set(c.id, c)
  }

  const ultima = (ultimaQualquer.data?.[0] ?? null) as { canal_id: number | null; origem: string | null } | null
  const tipoUltimaConversa = ultima
    ? (ultima.canal_id != null ? tipoCanal(canais.get(ultima.canal_id)?.tipo) : null) ?? tipoCanal(ultima.origem)
    : null

  return decidirCanal({
    negocioId: leadId, lojaId: loja, canais: [...canais.values()], conversas: convs,
    ultimaRecebidaComCanal: (ultimaComCanal.data?.[0] as { canal_id: number } | undefined) ?? null,
    tipoUltimaConversa,
    temTelefone: !!((contato.data?.telefone as string | null) ?? '').trim(),
    identidades: (identidades.data ?? []) as { canal_tipo: string; canal_id: number | null }[],
  }, agora)
}
