import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarTudo } from '@/lib/zapintel/conversas'
import { VERSAO_DO_PERFIL } from '@/lib/zapintel/perfil'
import type { Acesso } from './acesso'

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

const DATA = { type: 'string', description: 'Data no formato AAAA-MM-DD (horário de Brasília).' } as const
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
/** Início do dia em Brasília (o Brasil não tem horário de verão desde 2019). */
const inicio = (d: string) => `${d}T00:00:00-03:00`
const fimInclusivo = (d: string) => {
  const t = new Date(`${d}T12:00:00-03:00`)
  t.setUTCDate(t.getUTCDate() + 1)
  return `${t.toISOString().slice(0, 10)}T00:00:00-03:00`
}
const RELOGIO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const quando = (iso: string | null | undefined) => (iso ? RELOGIO.format(new Date(iso)) : null)
const diaDe = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
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

async function nomesDaEquipe(c: Contexto): Promise<Map<string, string>> {
  const { data } = (await c.svc.from('empresa_usuarios').select('usuario_id, usuarios(nome)')
    .eq('empresa_id', c.acesso.empresaId)) as { data: { usuario_id: string; usuarios: unknown }[] | null }
  const m = new Map<string, string>()
  for (const r of data ?? []) {
    const u = (Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios) as { nome?: string } | null
    if (u?.nome?.trim()) m.set(r.usuario_id, u.nome.trim())
  }
  return m
}

type LeadVisivel = {
  id: number; nome: string | null; kanban_status: string | null; filial_id: number | null
  created_at: string; produto_interessado: string | null; responsavel_id: string | null
  valor_estimado: number | null; origem: string | null; motivo_perda_id: number | null
  perdido_em: string | null; convertido_em: number | null
}

/** Os leads que ESTA pessoa vê — RLS de loja + "só os meus" do papel. */
async function leadsVisiveis(c: Contexto, filialId?: number): Promise<LeadVisivel[]> {
  return buscarTudo<LeadVisivel>((de, ate) => {
    let q = c.db.from('leads')
      .select('id, nome, kanban_status, filial_id, created_at, produto_interessado, responsavel_id, valor_estimado, origem, motivo_perda_id, perdido_em, convertido_em')
      .eq('empresa_id', c.acesso.empresaId).eq('ativo', true)
    if (filialId) q = q.eq('filial_id', filialId)
    // Lead sem responsável é da esteira, de todos — mesma regra da tela de leads.
    if (c.acesso.soMeusLeads) q = q.or(`responsavel_id.eq.${c.acesso.userId},responsavel_id.is.null`)
    return q.order('id', { ascending: true }).range(de, ate)
  })
}

type Status = { lead_id: number; ultima_recebida: string | null; ultima_enviada: string | null; mensagens: number }

async function statusDasConversas(c: Contexto): Promise<Map<number, Status>> {
  const linhas = await buscarTudo<Status>((de, ate) =>
    c.svc.rpc('assistente_status_conversas', { p_empresa: c.acesso.empresaId }).order('lead_id').range(de, ate))
  return new Map(linhas.map((s) => [Number(s.lead_id), s]))
}

type FichaCurta = {
  lead_id: number; gerado_em: string; mensagens: number
  classificacao: string | null; score: string | null; urgencia: string | null; rotulo: string | null; acao: string | null
}

async function fichasCurtas(c: Contexto): Promise<Map<number, FichaCurta>> {
  const linhas = await buscarTudo<FichaCurta>((de, ate) =>
    c.svc.from('zapintel_lead_perfil')
      .select('lead_id, gerado_em, mensagens, classificacao:perfil->>classificacao, score:perfil->>score, urgencia:perfil->>urgencia, rotulo:perfil->>perfil, acao:perfil->>proximaAcao')
      .eq('empresa_id', c.acesso.empresaId).order('lead_id').range(de, ate))
  return new Map(linhas.map((f) => [Number(f.lead_id), f]))
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
  const [{ data: msgs }, { data: diag }, { data: rel }] = await Promise.all([
    c.db.from('lead_mensagens').select('lead_id')
      .eq('empresa_id', c.acesso.empresaId).or(`conteudo.ilike.${padrao},transcricao.ilike.${padrao}`).limit(3000),
    c.svc.from('zapintel_lead_perfil').select('lead_id')
      .eq('empresa_id', c.acesso.empresaId).ilike('perfil->>diagnostico', padrao).limit(1000),
    c.svc.from('zapintel_lead_perfil').select('lead_id')
      .eq('empresa_id', c.acesso.empresaId).ilike('perfil->>relato', padrao).limit(1000),
  ])
  return new Set([...(msgs ?? []), ...(diag ?? []), ...(rel ?? [])].map((r) => Number((r as { lead_id: number }).lead_id)))
}

/** O lead está entre os que esta pessoa vê? Toda leitura por id passa aqui. */
async function leadSeVisivel(c: Contexto, id: number): Promise<LeadVisivel | null> {
  let q = c.db.from('leads')
    .select('id, nome, kanban_status, filial_id, created_at, produto_interessado, responsavel_id, valor_estimado, origem, motivo_perda_id, perdido_em, convertido_em')
    .eq('empresa_id', c.acesso.empresaId).eq('id', id)
  if (c.acesso.soMeusLeads) q = q.or(`responsavel_id.eq.${c.acesso.userId},responsavel_id.is.null`)
  const { data } = await q.maybeSingle()
  return (data as LeadVisivel | null) ?? null
}

// ── as ferramentas ───────────────────────────────────────────────────────────

type Entrada = Record<string, unknown>

async function vendasResumo(c: Contexto, e: Entrada): Promise<string> {
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
  const vendas = await buscarTudo<V>((de, ate) => {
    let q = c.db.from('vendas')
      .select('id, data_venda, created_at, valor_venda, valor_custo, lucro, forma_pagamento, canal_venda, status, vendedor_id, produto_id, quantidade, filial_id, grupo_pdv, cliente_id')
      .eq('empresa_id', c.acesso.empresaId)
      .gte('data_venda', inicio(e.de as string)).lt('data_venda', fimInclusivo(e.ate as string))
    if (filialId) q = q.eq('filial_id', filialId)
    if (c.acesso.soMinhasVendas) q = q.eq('vendedor_id', c.acesso.userId)
    return q.order('id', { ascending: true }).range(de, ate)
  })

  const [equipe, produtos] = await Promise.all([
    nomesDaEquipe(c),
    (async () => {
      const ids = [...new Set(vendas.map((v) => v.produto_id).filter((x): x is number => !!x))]
      if (!ids.length) return new Map<number, string>()
      const { data } = await c.db.from('produtos').select('id, nome').in('id', ids.slice(0, 300))
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
      case 'dia': return diaDe(v.data_venda ?? v.created_at)
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
        quando: quando(v.data_venda ?? v.created_at),
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
  const lojas = await filiais(c)
  const filialId = filialPorNome(lojas, e.filial)
  if (filialId === null) return saida({ erro: `loja "${e.filial}" não encontrada`, lojas: lojas.map((f) => f.rotulo) })
  const [leads, status, fichas, equipe] = await Promise.all([
    leadsVisiveis(c, filialId), statusDasConversas(c), fichasCurtas(c), nomesDaEquipe(c),
  ])
  const nomeFilial = new Map(lojas.map((f) => [f.id, f.rotulo]))
  const texto = typeof e.texto === 'string' && e.texto.trim() ? semAcento(e.texto) : null
  const limite = Math.min(40, Math.max(1, Number(e.limite) || 20))
  const citados = texto ? await leadsQueCitam(c, String(e.texto).trim()) : null

  const linhas = leads.map((l) => {
    const s = status.get(l.id)
    const f = fichas.get(l.id)
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
    if (dataValida(e.criado_de) && l.created_at < inicio(e.criado_de)) return false
    if (dataValida(e.criado_ate) && l.created_at >= fimInclusivo(e.criado_ate)) return false
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
      ultima_mensagem: quando(ultima),
      esperando_loja: esperando,
      esperando_desde: esperando ? quando(s?.ultima_recebida) : null,
      analise_ia: f ? {
        classificacao: f.classificacao, score: f.score ? Number(f.score) : null, urgencia: f.urgencia,
        perfil: f.rotulo, proxima_acao: f.acao,
        desatualizada: (s?.mensagens ?? 0) !== Number(f.mensagens),
      } : null,
    })),
  })
}

async function leadsNumeros(c: Contexto, e: Entrada): Promise<string> {
  if (!dataValida(e.de) || !dataValida(e.ate)) return saida({ erro: 'de/ate precisam ser AAAA-MM-DD' })
  const lojas = await filiais(c)
  const filialId = filialPorNome(lojas, e.filial)
  if (filialId === null) return saida({ erro: `loja "${e.filial}" não encontrada`, lojas: lojas.map((f) => f.rotulo) })
  const [todos, equipe, compraram, motivos] = await Promise.all([
    leadsVisiveis(c, filialId),
    nomesDaEquipe(c),
    // Quem COMPROU vem da ponte venda↔conversa, não do funil: em 14/10/2026
    // nenhum dos 432 leads de outubro estava marcado "convertido", embora a
    // loja tenha registrado 19 vendas no mês.
    c.svc.from('zapintel_venda_lead').select('lead_id').eq('empresa_id', c.acesso.empresaId)
      .then(({ data }) => new Set(((data ?? []) as { lead_id: number }[]).map((r) => Number(r.lead_id)))),
    c.db.from('motivos_perda').select('id, label').eq('empresa_id', c.acesso.empresaId)
      .then(({ data }) => new Map(((data ?? []) as { id: number; label: string }[]).map((m) => [m.id, m.label]))),
  ])
  const nomeFilial = new Map(lojas.map((f) => [f.id, f.rotulo]))
  const ini = inicio(e.de as string), fim = fimInclusivo(e.ate as string)
  const noPeriodo = todos.filter((l) => l.created_at >= ini && l.created_at < fim)

  const chave = (l: LeadVisivel): string => {
    switch (e.agrupar_por) {
      case 'origem': return l.origem || 'não informada'
      case 'filial': return (l.filial_id && nomeFilial.get(l.filial_id)) || 'sem loja'
      case 'etapa': return l.kanban_status || 'sem etapa'
      case 'dia': return diaDe(l.created_at)
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
  let id = Number(e.lead_id)
  if (!Number.isInteger(id) || id <= 0) {
    const nome = typeof e.nome === 'string' ? e.nome.trim() : ''
    if (!nome) return saida({ erro: 'informe lead_id ou nome' })
    let q = c.db.from('leads').select('id, nome, filial_id, ultima_mensagem_at')
      .eq('empresa_id', c.acesso.empresaId).eq('ativo', true).ilike('nome', `%${nome.replace(/[%_,()]/g, ' ')}%`)
    if (c.acesso.soMeusLeads) q = q.or(`responsavel_id.eq.${c.acesso.userId},responsavel_id.is.null`)
    const { data } = await q.order('ultima_mensagem_at', { ascending: false, nullsFirst: false }).limit(8)
    const achados = (data ?? []) as { id: number; nome: string; ultima_mensagem_at: string | null }[]
    if (!achados.length) return saida({ erro: `nenhum lead com "${nome}" no nome` })
    if (achados.length > 1) {
      return saida({ varios: achados.map((a) => ({ lead_id: a.id, nome: a.nome, ultima_mensagem: quando(a.ultima_mensagem_at) })) })
    }
    id = achados[0].id
  }
  const lead = await leadSeVisivel(c, id)
  if (!lead) return saida({ erro: 'lead não encontrado ou fora do que este usuário pode ver' })

  const [lojas, equipe, { data: ficha }, { count }] = await Promise.all([
    filiais(c), nomesDaEquipe(c),
    c.svc.from('zapintel_lead_perfil').select('perfil, gerado_em, mensagens, versao, modelo')
      .eq('empresa_id', c.acesso.empresaId).eq('lead_id', id).maybeSingle(),
    c.db.from('lead_mensagens').select('id', { count: 'exact', head: true }).eq('lead_id', id),
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
    entrou_em: quando(lead.created_at),
    mensagens_na_conversa: count ?? null,
    analise_ia: f ? {
      escrita_em: quando(f.gerado_em),
      desatualizada: (count ?? 0) !== f.mensagens || f.versao !== VERSAO_DO_PERFIL,
      mensagens_quando_escrita: f.mensagens,
      ...f.perfil,
    } : 'este lead ainda não tem análise de IA',
  })
}

async function conversaLer(c: Contexto, e: Entrada): Promise<string> {
  const id = Number(e.lead_id)
  if (!Number.isInteger(id) || id <= 0) return saida({ erro: 'lead_id inválido' })
  const lead = await leadSeVisivel(c, id)
  if (!lead) return saida({ erro: 'lead não encontrado ou fora do que este usuário pode ver' })
  const n = Math.min(200, Math.max(1, Number(e.ultimas) || 80))
  const { data } = await c.db.from('lead_mensagens')
    .select('direcao, conteudo, tipo, transcricao, created_at')
    .eq('lead_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(n)
  const msgs = ((data ?? []) as { direcao: string; conteudo: string | null; tipo: string | null; transcricao: string | null; created_at: string }[]).reverse()
  return saida({
    lead_id: id, nome: lead.nome,
    nota: msgs.length === n ? `mostrando as últimas ${n} mensagens` : 'conversa inteira',
    mensagens: msgs.map((m) => {
      const fala = m.transcricao?.trim()
      const quem = m.direcao === 'enviada' ? 'Loja' : 'Cliente'
      const corpo = fala || m.conteudo || `[${m.tipo || 'anexo'}]`
      return `[${quando(m.created_at)}] ${quem}${fala ? ' (áudio transcrito)' : ''}: ${corpo.slice(0, 1200)}`
    }),
  })
}

async function analisesPendentes(c: Contexto): Promise<string> {
  const [visiveis, { data, error }] = await Promise.all([
    leadsVisiveis(c),
    c.svc.rpc('zapintel_analises_pendentes', { p_empresa: c.acesso.empresaId, p_versao: VERSAO_DO_PERFIL }),
  ])
  if (error) return saida({ erro: 'não consegui contar agora' })
  const pode = new Set(visiveis.map((l) => l.id))
  const linhas = ((data ?? []) as {
    lead_id: number; nome: string | null; filial: string | null; tem_ficha: boolean; gerado_em: string | null
    mensagens_na_ficha: number | null; mensagens_agora: number; loja_deve: boolean | null
  }[]).filter((l) => pode.has(Number(l.lead_id)))
  const desat = linhas.filter((l) => l.tem_ficha)
  return saida({
    desatualizadas: desat.length,
    sem_analise: linhas.length - desat.length,
    como_gerar: 'Na tela: botão "Gerar nova análise" no lead, ou "Gerar análises" no topo deste chat (só no ZapIntel).',
    leads: desat.slice(0, 40).map((l) => ({
      lead_id: Number(l.lead_id), nome: l.nome, loja: l.filial,
      mensagens_novas: Math.max(0, l.mensagens_agora - (l.mensagens_na_ficha ?? 0)),
      analise_de: quando(l.gerado_em), esperando_loja: !!l.loja_deve,
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
