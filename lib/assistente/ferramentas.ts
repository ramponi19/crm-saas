import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarTudo } from '@/lib/zapintel/conversas'
import { lembrar } from './cache'
import { VERSAO_DO_PERFIL } from '@/lib/zapintel/perfil'
import { conversasDosLeads, umPorContatoELoja } from '@/lib/leads'
import type { Acesso } from './acesso'
import { agora, diaNoFuso, formatarDataHora, instanteLocal, paraData, somarDias } from '@/lib/datas'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'

/**
 * AS CONSULTAS QUE O ASSISTENTE PODE FAZER — TODAS SÓ DE LEITURA.
 *
 * O modelo não escreve SQL nem escolhe tabela: ele escolhe uma destas
 * ferramentas e os filtros, e o código decide o que é lido. Nenhuma delas
 * grava, envia mensagem ou muda status — o assistente é Meta-safe por
 * construção, não por instrução no prompt.
 *
 * ══ DUAS CHAVES, SEMPRE JUNTAS ═════════════════════════════════════════════
 *
 *   `db`  — o cliente COM A SESSÃO de quem pergunta. Leads, mensagens e
 *           vendas passam por aqui, sob a RLS de empresa e de loja.
 *   `svc` — service role, só para o que não tem política para o usuário
 *           (fichas do ZapIntel, contas agregadas). Tudo o que sai dele é
 *           cruzado com os leads que `db` devolveu antes de virar resposta.
 *
 * As permissões de papel (vendedor que não vê venda de outro, custo, lucro)
 * vêm de `Acesso` e são aplicadas aqui, em cada ferramenta.
 */

export interface Contexto {
  db: SupabaseClient
  svc: SupabaseClient
  acesso: Acesso
  /** Fuso da empresa. Ausente, é lido de `configuracoes_sistema` (uma vez por requisição). */
  fuso?: string
}

/** O que a tela mostra enquanto a ferramenta roda. */
export const ROTULO: Record<string, string> = {
  vendas_resumo: 'Consultando vendas',
  leads_buscar: 'Procurando leads',
  leads_numeros: 'Contando leads',
  lead_detalhes: 'Abrindo a ficha do lead',
  conversa_ler: 'Lendo a conversa',
  analises_pendentes: 'Conferindo análises pendentes',
}

const DATA = { type: 'string', description: 'Data no formato AAAA-MM-DD (dia no fuso da loja).' } as const
const FILIAL = {
  type: 'string',
  description: 'Nome ou cidade da loja (ex.: "Jaguariúna", "Mogi Guaçu"). Omitir = todas as lojas que o usuário vê.',
} as const

export const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'vendas_resumo',
    description: 'Vendas registradas no CRM num período: totais (quantidade, faturamento, ticket médio; custo e lucro só se o usuário puder ver) e, opcionalmente, agrupadas e/ou listadas. Use para relatórios de vendas, faturamento, desempenho de vendedor, produto mais vendido.',
    input_schema: {
      type: 'object',
      properties: {
        de: DATA,
        ate: { ...DATA, description: 'Data final, inclusive (AAAA-MM-DD).' },
        filial: FILIAL,
        agrupar_por: { type: 'string', enum: ['nenhum', 'dia', 'vendedor', 'produto', 'forma_pagamento', 'canal', 'filial'] },
        listar: { type: 'boolean', description: 'true = devolve também as vendas uma a uma (até 40, mais recentes primeiro).' },
      },
      required: ['de', 'ate'],
      additionalProperties: false,
    },
  },
  {
    name: 'leads_buscar',
    description: 'Lista leads (contatos/clientes em atendimento) com filtros. Traz etapa do funil, loja, quando falou por último, se está esperando resposta da loja, e a análise de IA quando existe (classificação, score, rótulo, próxima ação). Use para "quem está esperando resposta", "leads quentes de Jaguariúna", "quem perguntou de 17 Pro Max", "leads parados".',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Procura no nome do lead, no produto de interesse, no que foi dito nas conversas e na análise de IA (ex.: "18 Pro Max", "boleto", "troca").' },
        ativo_nos_ultimos_dias: { type: 'integer', description: 'Só leads com alguma mensagem nos últimos N dias. Use para "agora", "hoje", "esta semana".' },
        filial: FILIAL,
        etapa: { type: 'string', description: 'Etapa do funil (kanban), ex.: novo, em_contato, orcamento, negociando, convertido, perdido, pos_venda.' },
        classificacao: { type: 'string', enum: ['customer', 'hot', 'warm', 'followup', 'stalled', 'lost', 'unqualified'], description: 'Classificação da análise de IA: customer=cliente, hot=quente, warm=morno, followup, stalled=parado, lost=perdido, unqualified=sem perfil.' },
        esperando_loja: { type: 'boolean', description: 'true = só leads cuja última mensagem é do cliente (a loja deve resposta).' },
        parado_ha_dias_min: { type: 'integer', description: 'Só leads sem nenhuma mensagem há pelo menos N dias.' },
        criado_de: DATA,
        criado_ate: DATA,
        ordenar: { type: 'string', enum: ['recentes', 'mais_antigos_sem_resposta', 'score'] },
        limite: { type: 'integer', description: 'Máximo de leads devolvidos (padrão 20, máximo 40).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'leads_numeros',
    description: 'Contagens de leads que ENTRARAM num período, agrupadas (origem, loja, etapa, dia, responsável ou motivo de perda), mais quantos desses compraram (venda registrada ligada à conversa) ou foram perdidos. Use para relatórios de captação, funil e conversão.',
    input_schema: {
      type: 'object',
      properties: {
        de: DATA,
        ate: { ...DATA, description: 'Data final, inclusive.' },
        filial: FILIAL,
        agrupar_por: { type: 'string', enum: ['origem', 'filial', 'etapa', 'dia', 'responsavel', 'motivo_perda'] },
      },
      required: ['de', 'ate', 'agrupar_por'],
      additionalProperties: false,
    },
  },
  {
    name: 'lead_detalhes',
    description: 'A ficha completa de UM lead: dados do CRM e a análise de IA inteira (diagnóstico, relato, sinais de compra, objeções, pontas soltas, próxima ação, mensagem sugerida), com a data da análise e se a conversa mudou depois dela. Informe lead_id, ou nome para procurar.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        nome: { type: 'string', description: 'Parte do nome, quando não souber o id.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'conversa_ler',
    description: 'As mensagens da conversa de um lead (WhatsApp/Instagram), em ordem, com os áudios já transcritos marcados. Use quando precisar ler o que foi dito de fato — para analisar, resumir, ou responder algo que a ficha não cobre.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        ultimas: { type: 'integer', description: 'Quantas mensagens do fim da conversa (padrão 80, máximo 200).' },
      },
      required: ['lead_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'analises_pendentes',
    description: 'Leads cuja conversa mudou depois da última análise de IA (e os que ainda não têm análise). Use quando perguntarem o que precisa ser reanalisado. Esta ferramenta só lista — gerar análise é um botão na tela, não algo que o assistente faça.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

// ── utilidades ───────────────────────────────────────────────────────────────

const LIMITE_TEXTO = 24_000

/** Resultado compacto e com teto: o que volta para o modelo é pago por token. */
function saida(obj: unknown): string {
  const s = JSON.stringify(obj)
  return s.length > LIMITE_TEXTO ? s.slice(0, LIMITE_TEXTO) + '…(cortado)' : s
}

const dataValida = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
/** O fuso da empresa de quem pergunta: o do contexto, ou o salvo em configurações. */
async function fusoDe(c: Contexto): Promise<string> {
  return c.fuso ?? fusoDaEmpresa(c.svc, c.acesso.empresaId)
}
/** Meia-noite do dia `d` no fuso da loja (ISO). */
const inicio = (d: string, fuso: string) => instanteLocal(d, '00:00', fuso).toISOString()
/** Meia-noite do dia SEGUINTE a `d`: o `ate` é inclusivo para quem pergunta, o filtro usa `<`. */
const fimInclusivo = (d: string, fuso: string) => instanteLocal(somarDias(d, 1), '00:00', fuso).toISOString()
/** Instante do banco em ms — comparar texto ISO com deslocamentos diferentes erra a ordem. */
const ms = (iso: string) => paraData(iso)?.getTime() ?? 0
const quando = (iso: string | null | undefined, fuso: string) => (iso ? formatarDataHora(iso, undefined, '', fuso) || null : null)
const diaDe = (iso: string, fuso: string) => diaNoFuso(paraData(iso) ?? agora(), fuso)
const diasDesde = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null
const reais = (n: number) => Math.round(n * 100) / 100
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

type Filial = { id: number; nome: string; rotulo: string }

async function filiais(c: Contexto): Promise<Filial[]> {
  const { data } = await c.db.from('filiais').select('id, nome, cidade').eq('empresa_id', c.acesso.empresaId)
  return ((data ?? []) as { id: number; nome: string; cidade: string | null }[]).map((f) => ({
    id: f.id,
    nome: f.nome,
    // O nome que a equipe usa é a cidade — "JM Store Importados" repete a loja.
    rotulo: f.cidade?.trim() || f.nome.split('·')[1]?.trim() || f.nome,
  }))
}

/** "Jaguariúna" → id. `undefined` = sem filtro; `null` = nome que não existe. */
function filialPorNome(lista: Filial[], nome: unknown): number | undefined | null {
  if (typeof nome !== 'string' || !nome.trim()) return undefined
  const alvo = semAcento(nome)
  const achou = lista.find((f) => semAcento(f.rotulo).includes(alvo) || semAcento(f.nome).includes(alvo)
    || alvo.includes(semAcento(f.rotulo)))
  return achou ? achou.id : null
}

/** Nomes da equipe — da empresa, guardados 60 s (ver `cache.ts`). */
function nomesDaEquipe(c: Contexto): Promise<Map<string, string>> {
  return lembrar(`equipe:${c.acesso.empresaId}`, async () => {
    const { data } = (await c.svc.from('empresa_usuarios').select('usuario_id, usuarios(nome)')
      .eq('empresa_id', c.acesso.empresaId)) as { data: { usuario_id: string; usuarios: unknown }[] | null }
    const m = new Map<string, string>()
    for (const r of data ?? []) {
      const u = (Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios) as { nome?: string } | null
      if (u?.nome?.trim()) m.set(r.usuario_id, u.nome.trim())
    }
    return m
  })
}

type LeadVisivel = {
  id: number; nome: string | null; kanban_status: string | null; filial_id: number | null
  created_at: string; produto_interessado: string | null; responsavel_id: string | null
  valor_estimado: number | null; origem: string | null; motivo_perda_id: number | null
  perdido_em: string | null; convertido_em: number | null; contato_id: number
}

/**
 * O lead é o negócio + contato + etapa (a view `leads` caiu, 05/11/2026). A etapa
 * é a da view: o slug da etapa, senão o guardado em dados._lead.
 */
const SELECT_LEAD: string = 'id, contato_id, filial_id, created_at, responsavel_id, valor_estimado, motivo_perda_id, perdido_em, '
  + 'produto_interessado:dados->>produto_interessado, convertido_em:dados->_lead->>convertido_em, '
  + 'kanban:dados->_lead->>kanban_status, contato:contatos!contato_id(nome, origem), etapa:funil_etapas!etapa_id(slug)'
type LinhaLead = Omit<LeadVisivel, 'nome' | 'origem' | 'kanban_status' | 'convertido_em'> & {
  convertido_em: string | null; kanban: string | null
  contato: { nome: string | null; origem: string | null } | null; etapa: { slug: string } | null
}
const leadDaLinha = (r: LinhaLead): LeadVisivel => ({
  id: r.id, contato_id: r.contato_id, nome: r.contato?.nome ?? null, kanban_status: r.etapa?.slug ?? r.kanban ?? null,
  filial_id: r.filial_id, created_at: r.created_at, produto_interessado: r.produto_interessado,
  responsavel_id: r.responsavel_id, valor_estimado: r.valor_estimado == null ? null : Number(r.valor_estimado),
  origem: r.contato?.origem ?? null, motivo_perda_id: r.motivo_perda_id, perdido_em: r.perdido_em,
  convertido_em: r.convertido_em == null ? null : Number(r.convertido_em),
})

/**
 * Os leads que ESTA pessoa vê — RLS de loja + "só os meus" do papel.
 *
 * Numa ida ao banco (`assistente_leads_visiveis`, security invoker: a RLS de
 * quem pergunta vale lá dentro). Eram 1 a 4 páginas de 1.000 do mesmo select
 * (`SELECT_LEAD`); os campos são os mesmos, e `leadDaLinha` monta igual.
 */
async function leadsVisiveis(c: Contexto, filialId?: number): Promise<LeadVisivel[]> {
  const { data, error } = await c.db.rpc('assistente_leads_visiveis', {
    p_empresa: c.acesso.empresaId,
    p_filial: filialId ?? null,
    // Lead sem responsável é da esteira, de todos — mesma regra da tela de leads.
    p_responsavel: c.acesso.soMeusLeads ? c.acesso.userId : null,
  })
  if (error) throw new Error(`leads visíveis: ${error.message}`)
  return ((data ?? []) as LinhaLead[]).map(leadDaLinha)
}

const chaveLoja = (contato: number, filial: number | null) => `${contato}:${filial ?? -1}`

/**
 * O negócio PRINCIPAL de cada contato em cada loja (ativo primeiro, o mais novo):
 * era o `lead_id` que a antiga `lead_mensagens` dava à mensagem. Sob a sessão de
 * quem pergunta — a mensagem visível é da loja dele, e o negócio dela também.
 */
async function principaisDosContatos(db: SupabaseClient, empresaId: number, contatos: number[]): Promise<Map<string, number>> {
  type N = { id: number; contato_id: number; filial_id: number | null; ativo: boolean; created_at: string }
  const melhor = new Map<string, N>()
  const unicos = [...new Set(contatos)]
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await db.from('negocios').select('id, contato_id, filial_id, ativo, created_at')
      .eq('empresa_id', empresaId).in('contato_id', unicos.slice(i, i + 200))
    if (error) throw new Error(`negócios dos contatos: ${error.message}`)
    for (const n of (data ?? []) as N[]) {
      const k = chaveLoja(n.contato_id, n.filial_id)
      const p = melhor.get(k)
      if (!p || (n.ativo && !p.ativo)
        || (n.ativo === p.ativo && (n.created_at > p.created_at || (n.created_at === p.created_at && n.id > p.id)))) melhor.set(k, n)
    }
  }
  return new Map([...melhor].map(([k, n]) => [k, n.id]))
}

/**
 * O lead tem a conversa? As mensagens do lead são as do contato na loja do
 * negócio — e só do negócio principal ali, como a antiga `lead_mensagens` (os
 * outros negócios do mesmo contato na mesma loja ficavam sem conversa).
 */
async function leadTemConversa(c: Contexto, lead: LeadVisivel): Promise<boolean> {
  const principais = await principaisDosContatos(c.db, c.acesso.empresaId, [lead.contato_id])
  return principais.get(chaveLoja(lead.contato_id, lead.filial_id)) === lead.id
}

type Status = { lead_id: number; ultima_recebida: string | null; ultima_enviada: string | null; mensagens: number }

type FichaCurta = {
  lead_id: number; mensagens: number
  classificacao: string | null; score: string | null; urgencia: string | null; rotulo: string | null; acao: string | null
}

/** O filtro da pergunta que o banco já aplica (pré-seleção; a regra exata segue em `leadsBuscar`). */
export interface FiltroDoStatus {
  filial: number | null; esperando: boolean | null; ativoDias: number | null; paradoDias: number | null; classificacao: string | null
}

/** Os parâmetros de `leads_buscar` que viram filtro no SQL. Nunca mais estreito que a regra do app. */
export function filtroDoStatus(e: Entrada, filialId: number | undefined): FiltroDoStatus {
  const ativo = Number(e.ativo_nos_ultimos_dias)
  const parado = Number(e.parado_ha_dias_min)
  return {
    filial: filialId ?? null,
    esperando: e.esperando_loja === true ? true : e.esperando_loja === false ? false : null,
    // floor(dias) <= 2,5 equivale a floor(dias) <= 2; arredondar para cima só alarga. Acima de 100 anos, sem pré-seleção.
    ativoDias: ativo > 0 && ativo <= 36_500 ? Math.ceil(ativo) : null,
    paradoDias: parado > 0 && parado <= 36_500 ? Math.floor(parado) : null,
    classificacao: typeof e.classificacao === 'string' ? e.classificacao : null,
  }
}

type LinhaStatus = [number, string | null, string | null, number, number | null, string | null, string | null, string | null, string | null, string | null, boolean]

/**
 * Status da conversa + ficha curta de cada lead ativo que passa no filtro —
 * NUMA execução de `assistente_status_leads` (era `assistente_status_conversas`
 * paginada em ondas de 8, cada página recalculando tudo, mais 4 a 8 páginas
 * paralelas das fichas). Da empresa, guardado 60 s por filtro (`cache.ts`).
 */
function statusEFichas(c: Contexto, f: FiltroDoStatus): Promise<Map<number, { s: Status; f?: FichaCurta }>> {
  const chave = `status:${c.acesso.empresaId}:${f.filial ?? ''}:${f.esperando ?? ''}:${f.ativoDias ?? ''}:${f.paradoDias ?? ''}:${f.classificacao ?? ''}`
  return lembrar(chave, async () => {
    const { data, error } = await c.svc.rpc('assistente_status_leads', {
      p_empresa: c.acesso.empresaId, p_filial: f.filial, p_esperando: f.esperando,
      p_ativo_dias: f.ativoDias, p_parado_dias: f.paradoDias, p_classificacao: f.classificacao,
    })
    if (error) throw new Error(`status das conversas: ${error.message}`)
    const m = new Map<number, { s: Status; f?: FichaCurta }>()
    for (const [id, rec, env, n, fm, cls, score, urg, rotulo, acao, temFicha] of (data ?? []) as LinhaStatus[]) {
      const lead_id = Number(id)
      m.set(lead_id, {
        s: { lead_id, ultima_recebida: rec, ultima_enviada: env, mensagens: n },
        f: temFicha ? { lead_id, mensagens: fm as number, classificacao: cls, score, urgencia: urg, rotulo, acao } : undefined,
      })
    }
    return m
  })
}

/**
 * Leads em que o texto aparece na CONVERSA ou na ANÁLISE DE IA.
 *
 * O campo "produto de interesse" quase nunca é preenchido — "quem perguntou
 * de 18 Pro Max" achava 0 leads olhando só ele. A conversa vem pela sessão do
 * usuário (RLS de loja); a análise vem do service role e só serve para cruzar
 * com os leads que ele vê, em `leadsBuscar`.
 */
async function leadsQueCitam(c: Contexto, texto: string): Promise<Set<number>> {
  const padrao = `%${texto.replace(/[%_,()]/g, ' ').trim().replace(/\s+/g, '%')}%`
  // Em fila, não juntas (10/11/2026): a pergunta nunca tem duas leituras no ar.
  const { data: msgs } = await c.db.from('mensagens').select('contato_id, filial_id')
    .eq('empresa_id', c.acesso.empresaId).or(`conteudo.ilike.${padrao},transcricao.ilike.${padrao}`).limit(3000)
  const { data: diag } = await c.svc.from('zapintel_lead_perfil').select('lead_id')
    .eq('empresa_id', c.acesso.empresaId).ilike('perfil->>diagnostico', padrao).limit(1000)
  const { data: rel } = await c.svc.from('zapintel_lead_perfil').select('lead_id')
    .eq('empresa_id', c.acesso.empresaId).ilike('perfil->>relato', padrao).limit(1000)
  // Mensagem → negócio principal do contato na loja (o `lead_id` da antiga view).
  const achadas = (msgs ?? []) as { contato_id: number; filial_id: number | null }[]
  // Falha aqui vale o que valia o erro da consulta antiga: nenhuma conversa citando.
  const principais = await principaisDosContatos(c.db, c.acesso.empresaId, achadas.map((m) => m.contato_id))
    .catch(() => new Map<string, number>())
  const daConversa = achadas.map((m) => principais.get(chaveLoja(m.contato_id, m.filial_id)))
    .filter((id): id is number => id != null)
  return new Set([...daConversa, ...[...(diag ?? []), ...(rel ?? [])].map((r) => Number((r as { lead_id: number }).lead_id))])
}

/** O lead está entre os que esta pessoa vê? Toda leitura por id passa aqui. */
async function leadSeVisivel(c: Contexto, id: number): Promise<LeadVisivel | null> {
  let q = c.db.from('negocios')
    .select(SELECT_LEAD)
    .eq('empresa_id', c.acesso.empresaId).eq('id', id)
  if (c.acesso.soMeusLeads) q = q.or(`responsavel_id.eq.${c.acesso.userId},responsavel_id.is.null`)
  const { data } = await q.maybeSingle()
  return data ? leadDaLinha(data as unknown as LinhaLead) : null
}

/** Quantas mensagens a conversa do lead tem (0 se ele não é o negócio principal na loja). */
async function contarMensagensDoLead(c: Contexto, lead: LeadVisivel): Promise<{ count: number | null }> {
  // Sem saber se é o principal, o número é desconhecido (null), não zero.
  const tem = await leadTemConversa(c, lead).catch(() => null)
  if (tem === null) return { count: null }
  if (!tem) return { count: 0 }
  const base = c.db.from('mensagens').select('id', { count: 'exact', head: true })
    .eq('empresa_id', c.acesso.empresaId).eq('contato_id', lead.contato_id)
  const { count } = await (lead.filial_id == null ? base.is('filial_id', null) : base.eq('filial_id', lead.filial_id))
  return { count }
}

// ── as ferramentas ───────────────────────────────────────────────────────────

type Entrada = Record<string, unknown>

async function vendasResumo(c: Contexto, e: Entrada): Promise<string> {
  const fuso = await fusoDe(c)
  if (!dataValida(e.de) || !dataValida(e.ate)) return saida({ erro: 'de/ate precisam ser AAAA-MM-DD' })
  const lojas = await filiais(c)
  const filialId = filialPorNome(lojas, e.filial)
  if (filialId === null) return saida({ erro: `loja "${e.filial}" não encontrada`, lojas: lojas.map((f) => f.rotulo) })

  type V = {
    id: number; data_venda: string | null; created_at: string; valor_venda: number | null; valor_custo: number | null
    lucro: number | null; forma_pagamento: string | null; canal_venda: string | null; status: string | null
    vendedor_id: string | null; produto_id: number | null; quantidade: number | null; filial_id: number | null
    grupo_pdv: string | null; cliente_id: number | null
  }
  // A contagem vem com a primeira página: depois, só as páginas que existem.
  const vendas = await buscarTudo<V>((de, ate, primeira) => {
    let q = c.db.from('vendas_vendas')
      .select('id, data_venda, created_at, valor_venda, valor_custo, lucro, forma_pagamento, canal_venda, status, vendedor_id, produto_id, quantidade, filial_id, grupo_pdv, cliente_id',
        primeira ? { count: 'exact' } : undefined)
      .eq('empresa_id', c.acesso.empresaId)
      .gte('data_venda', inicio(e.de as string, fuso)).lt('data_venda', fimInclusivo(e.ate as string, fuso))
    if (filialId) q = q.eq('filial_id', filialId)
    if (c.acesso.soMinhasVendas) q = q.eq('vendedor_id', c.acesso.userId)
    return q.order('id', { ascending: true }).range(de, ate)
  })

  const [equipe, produtos] = await Promise.all([
    nomesDaEquipe(c),
    (async () => {
      const ids = [...new Set(vendas.map((v) => v.produto_id).filter((x): x is number => !!x))]
      if (!ids.length) return new Map<number, string>()
      const { data } = await c.db.from('estoque_produtos').select('id, nome').in('id', ids.slice(0, 300))
      return new Map(((data ?? []) as { id: number; nome: string }[]).map((p) => [p.id, p.nome]))
    })(),
  ])
  const nomeFilial = new Map(lojas.map((f) => [f.id, f.rotulo]))
  const fin = c.acesso.verFinanceiro

  // Uma venda do PDV com 3 itens são 3 linhas com o mesmo `grupo_pdv`.
  const pedidos = new Set(vendas.map((v) => v.grupo_pdv ?? `v${v.id}`))
  const fat = vendas.reduce((s, v) => s + Number(v.valor_venda ?? 0), 0)
  const totais: Record<string, unknown> = {
    vendas: pedidos.size,
    itens: vendas.reduce((s, v) => s + Number(v.quantidade ?? 1), 0),
    faturamento: reais(fat),
    ticket_medio: pedidos.size ? reais(fat / pedidos.size) : 0,
    encomendas_pendentes: vendas.filter((v) => v.status === 'encomenda').length,
  }
  /**
   * LUCRO SÓ ONDE HÁ CUSTO. Medido em 14/10/2026: as vendas da JM não têm
   * `valor_custo`, e a coluna `lucro` sai igual ao faturamento. Somá-la
   * anunciaria margem de 100% — número inventado com cara de relatório.
   */
  const comCusto = vendas.filter((v) => Number(v.valor_custo ?? 0) > 0)
  if (fin) {
    if (!comCusto.length) {
      totais.lucro = null
      totais.aviso_lucro = 'nenhuma venda do período tem custo registrado — lucro e margem não podem ser calculados'
    } else {
      const fatC = comCusto.reduce((s, v) => s + Number(v.valor_venda ?? 0), 0)
      const custo = comCusto.reduce((s, v) => s + Number(v.valor_custo ?? 0), 0)
      totais.lucro = reais(fatC - custo)
      totais.margem = fatC ? `${Math.round(((fatC - custo) / fatC) * 100)}%` : null
      if (comCusto.length < vendas.length) {
        totais.aviso_lucro = `lucro calculado só sobre ${comCusto.length} de ${vendas.length} itens (os outros não têm custo registrado)`
      }
    }
  }
  const lucroDe = (v: V): number | null =>
    Number(v.valor_custo ?? 0) > 0 ? Number(v.valor_venda ?? 0) - Number(v.valor_custo) : null

  const chave = (v: V): string => {
    switch (e.agrupar_por) {
      case 'dia': return diaDe(v.data_venda ?? v.created_at, fuso)
      case 'vendedor': return (v.vendedor_id && equipe.get(v.vendedor_id)) || 'sem vendedor'
      case 'produto': return (v.produto_id && produtos.get(v.produto_id)) || 'sem produto'
      case 'forma_pagamento': return v.forma_pagamento || 'não informada'
      case 'canal': return v.canal_venda || 'não informado'
      case 'filial': return (v.filial_id && nomeFilial.get(v.filial_id)) || 'sem loja'
      default: return ''
    }
  }
  let grupos: unknown = undefined
  if (e.agrupar_por && e.agrupar_por !== 'nenhum') {
    const g = new Map<string, { itens: number; faturamento: number; lucro: number; comCusto: number }>()
    for (const v of vendas) {
      const k = chave(v)
      const a = g.get(k) ?? { itens: 0, faturamento: 0, lucro: 0, comCusto: 0 }
      a.itens += Number(v.quantidade ?? 1); a.faturamento += Number(v.valor_venda ?? 0)
      const l = lucroDe(v)
      if (l != null) { a.lucro += l; a.comCusto++ }
      g.set(k, a)
    }
    grupos = [...g.entries()]
      .map(([k, a]) => ({
        grupo: k, itens: a.itens, faturamento: reais(a.faturamento),
        ...(fin && a.comCusto ? { lucro: reais(a.lucro) } : {}),
      }))
      .sort((x, y) => (e.agrupar_por === 'dia' ? (x.grupo < y.grupo ? -1 : 1) : y.faturamento - x.faturamento))
      .slice(0, 60)
  }

  let lista: unknown = undefined
  if (e.listar) {
    lista = [...vendas]
      .sort((a, b) => ((a.data_venda ?? a.created_at) < (b.data_venda ?? b.created_at) ? 1 : -1))
      .slice(0, 40)
      .map((v) => ({
        quando: quando(v.data_venda ?? v.created_at, fuso),
        produto: (v.produto_id && produtos.get(v.produto_id)) || null,
        valor: reais(Number(v.valor_venda ?? 0)),
        ...(fin && lucroDe(v) != null ? { lucro: reais(lucroDe(v)!) } : {}),
        pagamento: v.forma_pagamento, vendedor: (v.vendedor_id && equipe.get(v.vendedor_id)) || null,
        loja: (v.filial_id && nomeFilial.get(v.filial_id)) || null, status: v.status,
      }))
  }

  return saida({
    periodo: `${e.de} a ${e.ate}`,
    escopo: c.acesso.soMinhasVendas ? 'só as vendas deste usuário (permissão do papel)' : 'todas as vendas que o usuário pode ver',
    ...(fin ? {} : { aviso: 'custo e lucro ocultos: este usuário não tem permissão financeira' }),
    totais, grupos, vendas: lista,
  })
}

async function leadsBuscar(c: Contexto, e: Entrada): Promise<string> {
  const fuso = await fusoDe(c)
  const lojas = await filiais(c)
  const filialId = filialPorNome(lojas, e.filial)
  if (filialId === null) return saida({ erro: `loja "${e.filial}" não encontrada`, lojas: lojas.map((f) => f.rotulo) })
  // Em FILA, nunca juntas (10/11/2026): status + fichas numa execução, já
  // filtrados pela pergunta; os leads que a pessoa vê, numa; a equipe. As duas
  // da empresa ficam guardadas 60 s. Sem lead com conversa no filtro, nem lê os leads.
  const conversas = await statusEFichas(c, filtroDoStatus(e, filialId))
  const leads = conversas.size ? await leadsVisiveis(c, filialId) : []
  const equipe = await nomesDaEquipe(c)
  const nomeFilial = new Map(lojas.map((f) => [f.id, f.rotulo]))
  const texto = typeof e.texto === 'string' && e.texto.trim() ? semAcento(e.texto) : null
  const limite = Math.min(40, Math.max(1, Number(e.limite) || 20))
  const citados = texto ? await leadsQueCitam(c, String(e.texto).trim()) : null

  const linhas = leads.map((l) => {
    const s = conversas.get(l.id)?.s
    const f = conversas.get(l.id)?.f
    const ultima = [s?.ultima_recebida, s?.ultima_enviada].filter(Boolean).sort().pop() ?? null
    const esperando = !!s?.ultima_recebida && (!s.ultima_enviada || s.ultima_recebida > s.ultima_enviada)
    return { l, s, f, ultima, esperando }
  }).filter(({ l, s, f, ultima, esperando }) => {
    if (!s) return false // sem conversa nenhuma
    if (texto && !citados?.has(l.id) && !semAcento(`${l.nome ?? ''} ${l.produto_interessado ?? ''}`).includes(texto)) return false
    if (Number(e.ativo_nos_ultimos_dias) > 0 && (diasDesde(ultima) ?? 9999) > Number(e.ativo_nos_ultimos_dias)) return false
    if (typeof e.etapa === 'string' && e.etapa && l.kanban_status !== e.etapa) return false
    if (typeof e.classificacao === 'string' && f?.classificacao !== e.classificacao) return false
    if (e.esperando_loja === true && !esperando) return false
    if (e.esperando_loja === false && esperando) return false
    if (Number(e.parado_ha_dias_min) > 0 && (diasDesde(ultima) ?? 0) < Number(e.parado_ha_dias_min)) return false
    if (dataValida(e.criado_de) && ms(l.created_at) < ms(inicio(e.criado_de, fuso))) return false
    if (dataValida(e.criado_ate) && ms(l.created_at) >= ms(fimInclusivo(e.criado_ate, fuso))) return false
    return true
  })

  const ord = e.ordenar
  linhas.sort((a, b) => {
    if (ord === 'score') return Number(b.f?.score ?? -1) - Number(a.f?.score ?? -1)
    if (ord === 'mais_antigos_sem_resposta') {
      return (a.s?.ultima_recebida ?? '') < (b.s?.ultima_recebida ?? '') ? -1 : 1
    }
    return (a.ultima ?? '') < (b.ultima ?? '') ? 1 : -1
  })

  return saida({
    encontrados: linhas.length,
    mostrando: Math.min(limite, linhas.length),
    leads: linhas.slice(0, limite).map(({ l, s, f, ultima, esperando }) => ({
      lead_id: l.id,
      nome: l.nome,
      loja: (l.filial_id && nomeFilial.get(l.filial_id)) || null,
      etapa: l.kanban_status,
      interesse: l.produto_interessado,
      responsavel: (l.responsavel_id && equipe.get(l.responsavel_id)) || null,
      mensagens: s?.mensagens ?? 0,
      ultima_mensagem: quando(ultima, fuso),
      esperando_loja: esperando,
      esperando_desde: esperando ? quando(s?.ultima_recebida, fuso) : null,
      analise_ia: f ? {
        classificacao: f.classificacao, score: f.score ? Number(f.score) : null, urgencia: f.urgencia,
        perfil: f.rotulo, proxima_acao: f.acao,
        desatualizada: (s?.mensagens ?? 0) !== Number(f.mensagens),
      } : null,
    })),
  })
}

async function leadsNumeros(c: Contexto, e: Entrada): Promise<string> {
  const fuso = await fusoDe(c)
  if (!dataValida(e.de) || !dataValida(e.ate)) return saida({ erro: 'de/ate precisam ser AAAA-MM-DD' })
  const lojas = await filiais(c)
  const filialId = filialPorNome(lojas, e.filial)
  if (filialId === null) return saida({ erro: `loja "${e.filial}" não encontrada`, lojas: lojas.map((f) => f.rotulo) })
  // Em fila, não juntas (10/11/2026): uma pergunta não abre quatro leituras de uma vez.
  const todos = await leadsVisiveis(c, filialId)
  const equipe = await nomesDaEquipe(c)
  // Quem COMPROU vem da ponte venda↔conversa, não do funil: em 14/10/2026
  // nenhum dos 432 leads de outubro estava marcado "convertido", embora a
  // loja tenha registrado 19 vendas no mês.
  const compraram = await c.svc.from('zapintel_venda_lead').select('lead_id').eq('empresa_id', c.acesso.empresaId)
    .then(({ data }) => new Set(((data ?? []) as { lead_id: number }[]).map((r) => Number(r.lead_id))))
  const motivos = await c.db.from('motivos_perda').select('id, label').eq('empresa_id', c.acesso.empresaId)
    .then(({ data }) => new Map(((data ?? []) as { id: number; label: string }[]).map((m) => [m.id, m.label])))
  const nomeFilial = new Map(lojas.map((f) => [f.id, f.rotulo]))
  const ini = ms(inicio(e.de as string, fuso)), fim = ms(fimInclusivo(e.ate as string, fuso))
  const noPeriodo = todos.filter((l) => ms(l.created_at) >= ini && ms(l.created_at) < fim)

  const chave = (l: LeadVisivel): string => {
    switch (e.agrupar_por) {
      case 'origem': return l.origem || 'não informada'
      case 'filial': return (l.filial_id && nomeFilial.get(l.filial_id)) || 'sem loja'
      case 'etapa': return l.kanban_status || 'sem etapa'
      case 'dia': return diaDe(l.created_at, fuso)
      case 'responsavel': return (l.responsavel_id && equipe.get(l.responsavel_id)) || 'sem responsável'
      case 'motivo_perda': return l.motivo_perda_id ? motivos.get(l.motivo_perda_id) ?? 'outro' : 'não perdido'
      default: return ''
    }
  }
  const g = new Map<string, { leads: number; compraram: number; perdidos: number }>()
  for (const l of noPeriodo) {
    const k = chave(l)
    const a = g.get(k) ?? { leads: 0, compraram: 0, perdidos: 0 }
    a.leads++
    if (compraram.has(l.id) || l.kanban_status === 'convertido' || l.convertido_em) a.compraram++
    if (l.kanban_status === 'perdido' || l.perdido_em) a.perdidos++
    g.set(k, a)
  }
  return saida({
    periodo: `${e.de} a ${e.ate}`,
    escopo: c.acesso.soMeusLeads ? 'só os leads deste usuário e os sem responsável (permissão do papel)' : 'todos os leads que o usuário pode ver',
    total: noPeriodo.length,
    nota: '"compraram" = venda registrada no CRM ligada à conversa do lead; venda feita sem registro não aparece',
    grupos: [...g.entries()].map(([grupo, a]) => ({ grupo, ...a }))
      .sort((x, y) => (e.agrupar_por === 'dia' ? (x.grupo < y.grupo ? -1 : 1) : y.leads - x.leads)).slice(0, 60),
  })
}

async function leadDetalhes(c: Contexto, e: Entrada): Promise<string> {
  const fuso = await fusoDe(c)
  let id = Number(e.lead_id)
  if (!Number.isInteger(id) || id <= 0) {
    const nome = typeof e.nome === 'string' ? e.nome.trim() : ''
    if (!nome) return saida({ erro: 'informe lead_id ou nome' })
    // O nome é do contato; a última mensagem, da conversa dele na loja (só no
    // negócio principal). A ordem por ela é feita aqui, sobre até 1.000 nomes
    // que batem — a view ordenava no banco.
    let q = c.db.from('negocios').select('id, contato_id, filial_id, created_at, contato:contatos!contato_id!inner(nome)')
      .eq('empresa_id', c.acesso.empresaId).eq('ativo', true).ilike('contato.nome', `%${nome.replace(/[%_,()]/g, ' ')}%`)
    if (c.acesso.soMeusLeads) q = q.or(`responsavel_id.eq.${c.acesso.userId},responsavel_id.is.null`)
    const { data } = await q.limit(1000)
    // Um por contato e loja: o contato fundido com dois negócios abertos não vira "vários".
    const batem = umPorContatoELoja((data ?? []) as unknown as { id: number; contato_id: number; filial_id: number | null; created_at: string; contato: { nome: string } | null }[])
    const conversas = batem.length ? await conversasDosLeads(c.db, c.acesso.empresaId, batem) : new Map()
    const achados = batem
      .map((n) => ({ id: n.id, nome: n.contato?.nome ?? '', ultima_mensagem_at: (conversas.get(n.id)?.ultima_mensagem_at ?? null) as string | null }))
      .sort((a, b) => (b.ultima_mensagem_at ?? '').localeCompare(a.ultima_mensagem_at ?? ''))
      .slice(0, 8)
    if (!achados.length) return saida({ erro: `nenhum lead com "${nome}" no nome` })
    if (achados.length > 1) {
      return saida({ varios: achados.map((a) => ({ lead_id: a.id, nome: a.nome, ultima_mensagem: quando(a.ultima_mensagem_at, fuso) })) })
    }
    id = achados[0].id
  }
  const lead = await leadSeVisivel(c, id)
  if (!lead) return saida({ erro: 'lead não encontrado ou fora do que este usuário pode ver' })

  const [lojas, equipe, { data: ficha }, { count }] = await Promise.all([
    filiais(c), nomesDaEquipe(c),
    c.svc.from('zapintel_lead_perfil').select('perfil, gerado_em, mensagens, versao, modelo')
      .eq('empresa_id', c.acesso.empresaId).eq('lead_id', id).maybeSingle(),
    contarMensagensDoLead(c, lead),
  ])
  const f = ficha as { perfil: Record<string, unknown>; gerado_em: string; mensagens: number; versao: string; modelo: string | null } | null
  return saida({
    lead_id: lead.id,
    nome: lead.nome,
    loja: lojas.find((x) => x.id === lead.filial_id)?.rotulo ?? null,
    etapa: lead.kanban_status,
    origem: lead.origem,
    interesse: lead.produto_interessado,
    responsavel: (lead.responsavel_id && equipe.get(lead.responsavel_id)) || null,
    entrou_em: quando(lead.created_at, fuso),
    mensagens_na_conversa: count ?? null,
    analise_ia: f ? {
      escrita_em: quando(f.gerado_em, fuso),
      desatualizada: (count ?? 0) !== f.mensagens || f.versao !== VERSAO_DO_PERFIL,
      mensagens_quando_escrita: f.mensagens,
      ...f.perfil,
    } : 'este lead ainda não tem análise de IA',
  })
}

async function conversaLer(c: Contexto, e: Entrada): Promise<string> {
  const fuso = await fusoDe(c)
  const id = Number(e.lead_id)
  if (!Number.isInteger(id) || id <= 0) return saida({ erro: 'lead_id inválido' })
  const lead = await leadSeVisivel(c, id)
  if (!lead) return saida({ erro: 'lead não encontrado ou fora do que este usuário pode ver' })
  const n = Math.min(200, Math.max(1, Number(e.ultimas) || 80))
  // A conversa do contato na loja do negócio — só se ele é o principal ali.
  let data: unknown[] | null = []
  if (await leadTemConversa(c, lead)) {
    const base = c.db.from('mensagens')
      .select('direcao, conteudo, tipo, transcricao, created_at')
      .eq('empresa_id', c.acesso.empresaId).eq('contato_id', lead.contato_id)
    const daLoja = lead.filial_id == null ? base.is('filial_id', null) : base.eq('filial_id', lead.filial_id)
    const r = await daLoja.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(n)
    data = r.data
  }
  const msgs = ((data ?? []) as { direcao: string; conteudo: string | null; tipo: string | null; transcricao: string | null; created_at: string }[]).reverse()
  return saida({
    lead_id: id, nome: lead.nome,
    nota: msgs.length === n ? `mostrando as últimas ${n} mensagens` : 'conversa inteira',
    mensagens: msgs.map((m) => {
      const fala = m.transcricao?.trim()
      const quem = m.direcao === 'enviada' ? 'Loja' : 'Cliente'
      const corpo = fala || m.conteudo || `[${m.tipo || 'anexo'}]`
      return `[${quando(m.created_at, fuso)}] ${quem}${fala ? ' (áudio transcrito)' : ''}: ${corpo.slice(0, 1200)}`
    }),
  })
}

async function analisesPendentes(c: Contexto): Promise<string> {
  const fuso = await fusoDe(c)
  type Pendente = {
    lead_id: number; nome: string | null; filial: string | null; tem_ficha: boolean; gerado_em: string | null
    mensagens_na_ficha: number | null; mensagens_agora: number; loja_deve: boolean | null
  }
  // Paginado: a API corta em 1.000 linhas sem avisar, e numa troca de versão
  // da ficha a fila passa disso (ver /zapintel/api/perfil/pendentes).
  let visiveis: Awaited<ReturnType<typeof leadsVisiveis>>
  let data: Pendente[]
  try {
    // Função: páginas em fila (cada uma reexecuta a função). E as duas leituras em fila.
    data = await buscarTudo<Pendente>((de, ate) =>
      c.svc.rpc('zapintel_analises_pendentes', { p_empresa: c.acesso.empresaId, p_versao: VERSAO_DO_PERFIL })
        .order('lead_id').range(de, ate), { funcao: true })
    visiveis = await leadsVisiveis(c)
  } catch {
    return saida({ erro: 'não consegui contar agora' })
  }
  const pode = new Set(visiveis.map((l) => l.id))
  const linhas = data.filter((l) => pode.has(Number(l.lead_id)))
  const desat = linhas.filter((l) => l.tem_ficha)
  return saida({
    desatualizadas: desat.length,
    sem_analise: linhas.length - desat.length,
    como_gerar: 'Na tela: botão "Gerar nova análise" no lead, ou "Gerar análises" no topo deste chat (só no ZapIntel).',
    leads: desat.slice(0, 40).map((l) => ({
      lead_id: Number(l.lead_id), nome: l.nome, loja: l.filial,
      mensagens_novas: Math.max(0, l.mensagens_agora - (l.mensagens_na_ficha ?? 0)),
      analise_de: quando(l.gerado_em, fuso), esperando_loja: !!l.loja_deve,
    })),
  })
}

export async function executar(c: Contexto, nome: string, entrada: unknown): Promise<string> {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Entrada
  switch (nome) {
    case 'vendas_resumo': return vendasResumo(c, e)
    case 'leads_buscar': return leadsBuscar(c, e)
    case 'leads_numeros': return leadsNumeros(c, e)
    case 'lead_detalhes': return leadDetalhes(c, e)
    case 'conversa_ler': return conversaLer(c, e)
    case 'analises_pendentes': return analisesPendentes(c)
    default: return saida({ erro: `ferramenta desconhecida: ${nome}` })
  }
}
