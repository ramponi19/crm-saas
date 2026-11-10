import { montarLeads } from '@/lib/zapintel/montar'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import type { Lead } from '@/types/zapintel'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * LER AS CONVERSAS DE UMA EMPRESA — TODAS — E ENTREGAR AO MOTOR.
 *
 * ══ POR QUE EM PARALELO ════════════════════════════════════════════════════
 *
 * O PostgREST corta em 1000 linhas, em silêncio, inclusive em função. Paginar
 * era obrigatório; o erro era paginar EM FILA. Medido em 09/10/2026 sobre as
 * 54.888 mensagens da JM Store:
 *
 *     uma pagina por vez ....... 6,5 s
 *     oito ao mesmo tempo ...... 1,3 s
 *     o motor lendo tudo ....... 0,5 s
 *
 * Quase todo o custo era espera de ida e volta, não trabalho. Em ondas de oito
 * a leitura inteira cabe com folga nos 10 s de uma função — e some a razão que
 * existia para truncar a análise, que era o que fazia o painel anunciar número
 * errado com cara de número certo.
 *
 * ══ SEM CONTAR ANTES ═══════════════════════════════════════════════════════
 *
 * Saber quantas páginas pedir exigiria um `count` exato, que custa 1,7 s —
 * mais do que a leitura inteira. Então as ondas são otimistas: dispara oito,
 * e só continua se a última veio cheia. No fim gasta-se uma onda vazia, que
 * custa um décimo do que custaria contar.
 */


/** Linhas por página — o teto do PostgREST. */
const PAGINA = 1000

/** Páginas simultâneas. Oito satura o ganho; dezesseis não melhora (medido). */
const ONDA = 8

export const limpa = (s: string) => (s || '').replace(/[\r\n;]+/g, ' ').trim()

export type MsgBanco = {
  id: number
  lead_id: number
  direcao: string
  conteudo: string | null
  /** O que foi dito no audio, transcrito pela maquina. Ver `montar.ts`. */
  transcricao?: string | null
  tipo: string | null
  created_at: string
}

/**
 * O lead como o CRM o guarda.
 *
 * Eram 7 campos até 10/10/2026, porque o que viajava daqui tinha de caber nas
 * colunas fixas de um CSV. Sem o CSV no meio, o limite sumiu — e com ele a
 * necessidade de ADIVINHAR canal, vendedor, produto e motivo de perda, que o
 * CRM registra desde sempre.
 */
export type LeadBanco = {
  id: number
  nome: string | null
  telefone: string | null
  origem_id: string | null
  origem: string | null
  filial_id: number | null
  empresa_id: number
  created_at: string
  ultima_mensagem_at: string | null
  kanban_status: string | null
  motivo_perda_id: number | null
  /** Resolvido a partir de `motivos_perda` em `carregarConversas`. */
  motivo_perda?: string | null
  perdido_em: string | null
  produto_interessado: string | null
  responsavel_id: string | null
  /** Resolvido a partir de `usuarios` em `carregarConversas`. */
  responsavel_nome?: string | null
  convertido_em: number | null
  anuncio: unknown
}

/** `primeira` = é a página 0: quem quiser só as páginas que existem pede `count: 'exact'` nela. */
type Consulta = (de: number, ate: number, primeira: boolean) => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>

/**
 * O lead é o negócio + contato + etapa (a view `leads` caiu, 05/11/2026). Etapa
 * como a view: o slug da etapa, senão o guardado em dados._lead.
 */
const SELECT_LEAD_BANCO: string = 'id, contato_id, filial_id, empresa_id, created_at, motivo_perda_id, perdido_em, responsavel_id, '
  + 'produto_interessado:dados->>produto_interessado, convertido_em:dados->_lead->>convertido_em, anuncio:dados->_anuncio, '
  + 'kanban:dados->_lead->>kanban_status, contato:contatos!contato_id(nome, telefone, origem, origem_id), etapa:funil_etapas!etapa_id(slug)'
type LinhaLeadBanco = {
  id: number; contato_id: number; filial_id: number | null; empresa_id: number; created_at: string
  motivo_perda_id: number | null; perdido_em: string | null; responsavel_id: string | null
  produto_interessado: string | null; convertido_em: string | null; anuncio: unknown; kanban: string | null
  contato: { nome: string | null; telefone: string | null; origem: string | null; origem_id: string | null } | null
  etapa: { slug: string } | null
}

const chaveLoja = (contato: number, filial: number | null) => `${contato}:${filial ?? -1}`

const colher = <T,>({ data, error }: { data: unknown; error: unknown }): T[] => {
  if (error) throw new Error((error as { message?: string }).message ?? 'falha ao ler')
  return (data ?? []) as T[]
}

export interface ComoBuscar {
  /**
   * A fonte é uma FUNÇÃO (rpc): cada página reexecuta a função inteira. Então
   * as páginas vão UMA DE CADA VEZ e param na primeira que não vem cheia —
   * nunca oito execuções da mesma função ao mesmo tempo. Medido em 10/11/2026:
   * `assistente_status_conversas` em ondas de 8 era 9 execuções de 0,7–3,8 s
   * por pergunta ao Assistente; cinco perguntas em 2 minutos derrubaram o
   * dashboard e o resumo de quem perguntava.
   */
  funcao?: boolean
}

/**
 * Lê tudo. Tabela: em ondas paralelas (ver o cabeçalho para o porquê de não
 * contar antes) — mas, se a consulta pediu a contagem na primeira página
 * (`count: 'exact'` quando o 3º argumento é true), pede SÓ as páginas que
 * existem. Função: em fila (ver `ComoBuscar.funcao`).
 */
export async function buscarTudo<T>(consulta: Consulta, como: ComoBuscar = {}): Promise<T[]> {
  // A primeira página vai sozinha. O caminho incremental (um lead, dezenas de
  // mensagens) termina aqui com UMA ida ao banco, em vez de oito para buscar o
  // que cabe numa.
  const r0 = await consulta(0, PAGINA - 1, true)
  const primeira = colher<T>(r0)
  if (primeira.length < PAGINA) return primeira

  const fora = primeira
  if (como.funcao) {
    for (let pagina = 1; ; pagina++) {
      const lote = colher<T>(await consulta(pagina * PAGINA, (pagina + 1) * PAGINA - 1, false))
      fora.push(...lote)
      if (lote.length < PAGINA) return fora
    }
  }

  // Com a contagem em mãos, as páginas que faltam são exatamente estas.
  const total = (r0 as { count?: unknown }).count
  if (typeof total === 'number') {
    const paginas = Math.ceil(total / PAGINA)
    for (let p = 1; p < paginas; p += ONDA) {
      const pedidos = []
      for (let i = p; i < Math.min(paginas, p + ONDA); i++) pedidos.push(consulta(i * PAGINA, (i + 1) * PAGINA - 1, false))
      for (const r of await Promise.all(pedidos)) fora.push(...colher<T>(r))
    }
    return fora
  }

  for (let onda = 0; ; onda++) {
    const pedidos = []
    for (let i = 0; i < ONDA; i++) {
      const de = (1 + onda * ONDA + i) * PAGINA
      pedidos.push(consulta(de, de + PAGINA - 1, false))
    }
    const respostas = await Promise.all(pedidos)

    let ultimaCheia = false
    for (const r of respostas) {
      const lote = colher<T>(r)
      fora.push(...lote)
      ultimaCheia = lote.length === PAGINA
    }
    // Só a ÚLTIMA página da onda decide: se ela veio cheia, pode haver mais.
    if (!ultimaCheia) return fora
  }
}


/** O id do lead vem do campo `filename` (`lead-123`), que o parser preserva. */
export const idDoLead = (lead: Lead): number | null => {
  const m = /^lead-(\d+)$/.exec(lead.filename ?? '')
  return m ? Number(m[1]) : null
}

export interface Conversas {
  /** O que o motor produziu, COM as mensagens. Nunca deve viajar inteiro. */
  analisados: Lead[]
  /** Os leads como estão no CRM, por id — é daqui que sai a loja de cada um. */
  porId: Map<number, LeadBanco>
  nomeDaLoja: string
  /** O preset da empresa no CRM (`empresas.preset_onboarding`), cru. Ver `papel.ts`. */
  preset: string | null
  /**
   * O que do CRM não deu para ler nesta carga (17/10/2026). Nas telas, o
   * padrão ("Loja", sem responsável) basta; no PROMPT da IA, padrão pareceria
   * fato — então o prompt diz "informação indisponível" para cada item daqui.
   */
  indisponivel: DadoIndisponivel[]
}

export type DadoIndisponivel = 'empresa' | 'responsaveis' | 'motivos_perda' | 'venda' | 'valor_venda'

/**
 * Carrega e analisa as conversas da empresa.
 *
 * `ids` vazio significa a empresa inteira. Lead arquivado fica de fora: o CRM
 * já o tirou da esteira, e trazê-lo só faria o painel contar duas vezes o que
 * foi descartado.
 */
export async function carregarConversas(
  db: SupabaseClient,
  empresaId: number,
  ids: number[] = [],
): Promise<Conversas> {
  const indisponivel: DadoIndisponivel[] = []
  const { data: empresa, error: erroEmpresa } = await db
    .from('empresas').select('nome, preset_onboarding').eq('id', empresaId).maybeSingle()
  if (erroEmpresa) indisponivel.push('empresa')

  const nomeDaLoja = limpa((empresa?.nome as string) || 'Loja') || 'Loja'
  const preset = (empresa as { preset_onboarding?: string | null } | null)?.preset_onboarding ?? null

  const linhasLead = await buscarTudo<LinhaLeadBanco>((de, ate) => {
    let q = db.from('negocios')
      .select(SELECT_LEAD_BANCO)
      .eq('empresa_id', empresaId).eq('ativo', true)
    if (ids.length) q = q.in('id', ids)
    return q.order('id', { ascending: true }).range(de, ate)
  })
  const contatoDoLead = new Map(linhasLead.map((l) => [l.id, l.contato_id]))
  const leadsRaw: LeadBanco[] = linhasLead.map((l) => ({
    id: l.id, nome: l.contato?.nome ?? null, telefone: l.contato?.telefone ?? null,
    origem_id: l.contato?.origem_id ?? null, origem: l.contato?.origem ?? null,
    filial_id: l.filial_id, empresa_id: l.empresa_id, created_at: l.created_at,
    ultima_mensagem_at: null, // da conversa, preenchida abaixo
    kanban_status: l.etapa?.slug ?? l.kanban ?? null,
    motivo_perda_id: l.motivo_perda_id, perdido_em: l.perdido_em, produto_interessado: l.produto_interessado,
    responsavel_id: l.responsavel_id, convertido_em: l.convertido_em == null ? null : Number(l.convertido_em),
    anuncio: l.anuncio ?? null,
  }))

  // O motivo da perda é escolhido de uma lista por quem perdeu o lead. São
  // poucas linhas por empresa, então vale uma consulta e um mapa — bem mais
  // barato que um join carregado em cada página de leads.
  const { data: motivosRaw, error: erroMotivos } = await db
    .from('motivos_perda').select('id, label').eq('empresa_id', empresaId)
  if (erroMotivos) indisponivel.push('motivos_perda')
  const motivo = new Map<number, string>(
    ((motivosRaw ?? []) as { id: number; label: string }[]).map((m) => [m.id, m.label]),
  )
  // O vendedor RESPONSÁVEL, quando alguém atribuiu. É fato; o que o ZapIntel
  // fazia era deduzir o nome do texto da conversa, e o resultado tinha "hoje",
  // "Pedroe" e "Pedreo" na lista de vendedores.
  const { data: usuariosRaw, error: erroUsuarios } = (await db
    .from('empresa_usuarios')
    .select('usuario_id, usuarios(id, nome)')
    .eq('empresa_id', empresaId).eq('ativo', true)) as { data: unknown[] | null; error: { message: string } | null }
  if (erroUsuarios) indisponivel.push('responsaveis')
  const nomeDoUsuario = new Map<string, string>()
  // O PostgREST devolve o relacionamento como ARRAY quando não consegue provar
  // que é 1-para-1, então o tipo gerado é mais largo do que a realidade. Achatar
  // aqui é mais honesto que afirmar um formato com `as`.
  for (const u of (usuariosRaw ?? []) as unknown[]) {
    const rel = (u as { usuarios?: unknown }).usuarios
    for (const x of (Array.isArray(rel) ? rel : [rel])) {
      const p = x as { id?: string; nome?: string | null } | null
      if (p?.id && p.nome) nomeDoUsuario.set(p.id, p.nome)
    }
  }

  for (const l of leadsRaw) {
    l.motivo_perda = l.motivo_perda_id != null ? motivo.get(l.motivo_perda_id) ?? null : null
    l.responsavel_nome = l.responsavel_id ? nomeDoUsuario.get(l.responsavel_id) ?? null : null
  }

  const porId = new Map(leadsRaw.map((l) => [l.id, l]))
  if (!porId.size) {
    return { analisados: [], porId, nomeDaLoja, preset, indisponivel }
  }

  /**
   * A CONVERSA É DO CONTATO NA LOJA, e vale para o negócio PRINCIPAL dele ali
   * (ativo primeiro, o mais novo) — o `lead_id` que a antiga `lead_mensagens`
   * dava. Os negócios entram todos (ativos ou não) para escolher o principal,
   * como a view escolhia.
   */
  // Filtrar por contato só quando o recorte é pequeno: um `in` com milhares de
  // itens vira uma URL que o servidor recusa. Na empresa inteira o filtro de
  // empresa já basta, e os poucos leads arquivados são descartados ao montar.
  const contatosAlvo = ids.length ? [...new Set(contatoDoLead.values())] : []
  type NegocioDoContato = { id: number; contato_id: number; filial_id: number | null; ativo: boolean; created_at: string }
  type ConversaDoContato = { contato_id: number; filial_id: number | null; ultima_mensagem_at: string | null }
  type MsgDoContato = Omit<MsgBanco, 'lead_id'> & { contato_id: number; filial_id: number | null }
  const [negociosDosContatos, conversasDosContatos, msgsDosContatos] = await Promise.all([
    buscarTudo<NegocioDoContato>((de, ate) => {
      let q = db.from('negocios').select('id, contato_id, filial_id, ativo, created_at').eq('empresa_id', empresaId)
      if (contatosAlvo.length) q = q.in('contato_id', contatosAlvo)
      return q.order('id', { ascending: true }).range(de, ate)
    }),
    buscarTudo<ConversaDoContato>((de, ate) => {
      let q = db.from('conversas').select('contato_id, filial_id, ultima_mensagem_at').eq('empresa_id', empresaId)
      if (contatosAlvo.length) q = q.in('contato_id', contatosAlvo)
      return q.order('id', { ascending: true }).range(de, ate)
    }),
    buscarTudo<MsgDoContato>((de, ate) => {
      let q = db.from('mensagens')
        .select('id, contato_id, filial_id, direcao, conteudo, tipo, created_at, transcricao')
        .eq('empresa_id', empresaId)
      if (contatosAlvo.length) q = q.in('contato_id', contatosAlvo)
      return q.order('id', { ascending: true }).range(de, ate)
    }),
  ])

  const principal = new Map<string, NegocioDoContato>()
  for (const n of negociosDosContatos) {
    const k = chaveLoja(n.contato_id, n.filial_id)
    const p = principal.get(k)
    if (!p || (n.ativo && !p.ativo)
      || (n.ativo === p.ativo && (n.created_at > p.created_at || (n.created_at === p.created_at && n.id > p.id)))) principal.set(k, n)
  }
  // A última mensagem do lead: a mais recente das conversas do contato na loja,
  // só no negócio principal (como a view calculava).
  const ultimaDaLoja = new Map<string, string>()
  for (const c of conversasDosContatos) {
    if (!c.ultima_mensagem_at) continue
    const k = chaveLoja(c.contato_id, c.filial_id)
    const a = ultimaDaLoja.get(k)
    if (!a || c.ultima_mensagem_at > a) ultimaDaLoja.set(k, c.ultima_mensagem_at)
  }
  for (const l of leadsRaw) {
    const k = chaveLoja(contatoDoLead.get(l.id)!, l.filial_id)
    l.ultima_mensagem_at = principal.get(k)?.id === l.id ? ultimaDaLoja.get(k) ?? null : null
  }

  // Mensagem sem negócio na loja não tem lead (a view dava lead_id nulo): fica fora.
  const msgs: MsgBanco[] = []
  for (const m of msgsDosContatos) {
    const lead = principal.get(chaveLoja(m.contato_id, m.filial_id))
    if (!lead) continue
    msgs.push({
      id: m.id, lead_id: lead.id, direcao: m.direcao, conteudo: m.conteudo,
      transcricao: m.transcricao, tipo: m.tipo, created_at: m.created_at,
    })
  }

  // ORDEM POR id, NÃO POR created_at — e a razão é correção, não custo.
  //
  // Páginas paralelas só devolvem o conjunto certo se a ordem for TOTAL. Duas
  // mensagens com o mesmo `created_at` (o webhook grava em lote) podem cair em
  // ordem diferente a cada consulta, e aí a linha que estava no fim da página 3
  // aparece de novo no começo da página 4 — ou some. `id` é único, então não
  // empata. A ordem cronológica que o parser espera se restaura aqui, em
  // memória, sobre dado já carregado: milissegundos.
  msgs.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))

  return { analisados: montarLeads(porId, msgs, await fusoDaEmpresa(db, empresaId)), porId, nomeDaLoja, preset, indisponivel }
}
