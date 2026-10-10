import { montarLeads } from '@/lib/zapintel/montar'
import { mapCrmSegmento } from '@/lib/zapintel/segments/segments'
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

type Consulta = (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>

const colher = <T,>({ data, error }: { data: unknown; error: unknown }): T[] => {
  if (error) throw new Error((error as { message?: string }).message ?? 'falha ao ler')
  return (data ?? []) as T[]
}

/** Lê tudo em ondas paralelas. Ver o cabeçalho para o porquê de não contar antes. */
export async function buscarTudo<T>(consulta: Consulta): Promise<T[]> {
  // A primeira página vai sozinha. O caminho incremental (um lead, dezenas de
  // mensagens) termina aqui com UMA ida ao banco, em vez de oito para buscar o
  // que cabe numa.
  const primeira = colher<T>(await consulta(0, PAGINA - 1))
  if (primeira.length < PAGINA) return primeira

  const fora = primeira
  for (let onda = 0; ; onda++) {
    const pedidos = []
    for (let i = 0; i < ONDA; i++) {
      const de = (1 + onda * ONDA + i) * PAGINA
      pedidos.push(consulta(de, de + PAGINA - 1))
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

/** Onde o tempo da leitura foi. Vai junto na resposta: ver `Painel.tempos`. */
export interface TemposLeitura {
  leads: number
  mensagens: number
  motor: number
}

export interface Conversas {
  tempos: TemposLeitura
  /** O que o motor produziu, COM as mensagens. Nunca deve viajar inteiro. */
  analisados: Lead[]
  /** Os leads como estão no CRM, por id — é daqui que sai a loja de cada um. */
  porId: Map<number, LeadBanco>
  nomeDaLoja: string
  segmentId: string
  totalMensagens: number
  /**
   * O id da mensagem mais recente que ENTROU nesta análise.
   *
   * É a âncora do "tem coisa nova": a tela compara este número com o pulso do
   * servidor. Comparar por contagem não serviria — mensagem apagada faria o
   * total cair e o painel pareceria atualizado quando não está.
   */
  ultimaMensagem: number
}

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
  const { data: empresa } = await db
    .from('empresas').select('nome, segmento').eq('id', empresaId).maybeSingle()

  const nomeDaLoja = limpa((empresa?.nome as string) || 'Loja') || 'Loja'
  const segmentId = mapCrmSegmento((empresa as { segmento?: string } | null)?.segmento)

  const t0 = Date.now()
  const leadsRaw = await buscarTudo<LeadBanco>((de, ate) => {
    let q = db.from('leads')
      .select('id, nome, telefone, origem_id, origem, filial_id, empresa_id, created_at,'
        + ' ultima_mensagem_at, kanban_status, motivo_perda_id, perdido_em,'
        + ' produto_interessado, responsavel_id, convertido_em, anuncio')
      .eq('empresa_id', empresaId).eq('ativo', true)
    if (ids.length) q = q.in('id', ids)
    return q.order('id', { ascending: true }).range(de, ate)
  })

  // O motivo da perda é escolhido de uma lista por quem perdeu o lead. São
  // poucas linhas por empresa, então vale uma consulta e um mapa — bem mais
  // barato que um join carregado em cada página de leads.
  const { data: motivosRaw } = await db
    .from('motivos_perda').select('id, label').eq('empresa_id', empresaId)
  const motivo = new Map<number, string>(
    ((motivosRaw ?? []) as { id: number; label: string }[]).map((m) => [m.id, m.label]),
  )
  // O vendedor RESPONSÁVEL, quando alguém atribuiu. É fato; o que o ZapIntel
  // fazia era deduzir o nome do texto da conversa, e o resultado tinha "hoje",
  // "Pedroe" e "Pedreo" na lista de vendedores.
  const { data: usuariosRaw } = (await db
    .from('empresa_usuarios')
    .select('usuario_id, usuarios(id, nome)')
    .eq('empresa_id', empresaId).eq('ativo', true)) as { data: unknown[] | null }
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

  const t1 = Date.now()

  const porId = new Map(leadsRaw.map((l) => [l.id, l]))
  if (!porId.size) {
    return {
      analisados: [], porId, nomeDaLoja, segmentId, totalMensagens: 0, ultimaMensagem: 0,
      tempos: { leads: t1 - t0, mensagens: 0, motor: 0 },
    }
  }

  const alvo = [...porId.keys()]
  const msgs = await buscarTudo<MsgBanco>((de, ate) => {
    let q = db.from('lead_mensagens')
      .select('id, lead_id, direcao, conteudo, tipo, created_at')
      .eq('empresa_id', empresaId)
    // Filtrar por id só quando o recorte é pequeno: um `in` com milhares de
    // itens vira uma URL que o servidor recusa. Na empresa inteira o filtro de
    // empresa já basta, e os poucos leads arquivados são descartados ao montar.
    if (ids.length) q = q.in('lead_id', alvo)
    return q.order('id', { ascending: true }).range(de, ate)
  })

  // ORDEM POR id, NÃO POR created_at — e a razão é correção, não custo.
  //
  // Páginas paralelas só devolvem o conjunto certo se a ordem for TOTAL. Duas
  // mensagens com o mesmo `created_at` (o webhook grava em lote) podem cair em
  // ordem diferente a cada consulta, e aí a linha que estava no fim da página 3
  // aparece de novo no começo da página 4 — ou some. `id` é único, então não
  // empata. A ordem cronológica que o parser espera se restaura aqui, em
  // memória, sobre dado já carregado: milissegundos.
  msgs.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))

  const t2 = Date.now()

  const analisados = montarLeads(porId, msgs)
  const t3 = Date.now()

  let ultimaMensagem = 0
  for (const m of msgs) if (m.id > ultimaMensagem) ultimaMensagem = m.id

  return {
    analisados, porId, nomeDaLoja, segmentId, totalMensagens: msgs.length, ultimaMensagem,
    tempos: { leads: t1 - t0, mensagens: t2 - t1, motor: t3 - t2 },
  }
}
