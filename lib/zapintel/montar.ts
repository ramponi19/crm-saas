import type { Lead, RawMessage, Objection } from '@/types/zapintel'
import { classifyLead } from '@/lib/zapintel/classification/engine'
import { scoreLead } from '@/lib/zapintel/scoring/leadScore'
import { inferProfile } from '@/lib/zapintel/insights/profile'
import { generateNextAction } from '@/lib/zapintel/insights/followUp'
import type { LeadBanco, MsgBanco } from '@/lib/zapintel/conversas'

/**
 * O LEAD, MONTADO DIRETO DAS TABELAS DO CRM.
 *
 * ══ O QUE ISTO SUBSTITUIU ══════════════════════════════════════════════════
 *
 * Até 10/10/2026 o caminho era este:
 *
 *     leads + lead_mensagens  →  vira CSV em texto  →  parseia o CSV  →  Lead
 *
 * Sobra da época em que o ZapIntel comia planilha exportada de conversa. Quando
 * ele passou a se alimentar do CRM, ninguém tirou o funil: o dado saía do banco
 * estruturado, virava texto e era re-parseado para virar estrutura de novo.
 *
 * ══ POR QUE ISSO NÃO ERA SÓ DESPERDÍCIO ════════════════════════════════════
 *
 * O CSV tinha COLUNAS FIXAS. Tudo que não coubesse nelas era estruturalmente
 * impossível de carregar — e a tabela `leads` tem 33 colunas, das quais o
 * ZapIntel lia 7. O que ficava de fora, e que ele então ADIVINHAVA:
 *
 *     origem ................. 2.072 leads   adivinhava o canal pelo telefone
 *     kanban_status .......... 2.072         inventava a própria classificação
 *     motivo_perda ............. 124         deduzia "lost" por palavra-chave (21)
 *     anuncio .................. 416         ignorava de onde o lead veio
 *     produto_interessado ...... 213         deduzia o produto do texto da loja
 *     responsavel_id ............ 89         deduzia o vendedor por "me chamo X"
 *     convertido_em .............. 12        ignorava
 *
 * E ainda custava CPU: montar e parsear 55 mil linhas era parte dos 2,76 s por
 * recálculo que o dia inteiro foi gasto economizando.
 *
 * ══ UMA ARMADILHA MULTI-TENANT QUE MORREU JUNTO ════════════════════════════
 *
 * O parser decidia quem era a loja comparando o telefone com
 * `STORE_PHONE = "5519998862028"` — o número da JM, escrito no código. Para a
 * Imobiliária ou para qualquer tenant novo, NENHUMA mensagem seria reconhecida
 * como da loja, e toda métrica de atendimento sairia zerada em silêncio.
 * Aqui quem diz é `lead_mensagens.direcao`, que o banco grava por tenant.
 */

const DIA_MS = 86_400_000

const BUY_SIGNALS_MAP: Record<string, string> = {
  'pix': 'Pediu chave Pix',
  'cartão': 'Mencionou cartão',
  'parcel': 'Pediu parcelamento',
  '18x': 'Pediu 18x',
  '12x': 'Pediu 12x',
  'reserva': 'Pediu reserva',
  'nota fiscal': 'Pediu NF',
  'nf': 'Pediu NF',
  'garantia': 'Perguntou sobre garantia',
  'entrega': 'Perguntou sobre entrega',
  'fechar': 'Sinalizou fechamento',
  'blz': 'Concordou (Blz)',
  'combinado': 'Confirmou (Combinado)',
  'confirmado': 'Confirmou compra',
  'paguei': 'Disse que pagou',
  'transferi': 'Confirmou transferência',
  'quero esse': 'Declarou interesse direto',
  'pode separar': 'Pediu para separar',
  'saúde da bateria': 'Pediu saúde da bateria',
  'imei': 'Perguntou IMEI',
  'disponível': 'Verificou disponibilidade',
}

function sinaisDeCompra(leadText: string): string[] {
  // `new Set` porque "nota fiscal" e "nf" dão o mesmo rótulo: a ficha saía com
  // "Pediu NF, Pediu NF" antes de alguém reparar.
  return [...new Set(
    Object.entries(BUY_SIGNALS_MAP).filter(([kw]) => leadText.includes(kw)).map(([, label]) => label),
  )].slice(0, 6)
}

const OBJECOES: [Objection, string[]][] = [
  [{ type: 'price', label: 'Preço / Concorrência' },
    ['caro', 'salgado', 'mais barato', 'desconto', 'mercado livre', 'shopee', 'olx', 'concorrência', 'abaixa', 'menor valor']],
  [{ type: 'timing', label: 'Indecisão / Timing' },
    ['vou pensar', 'deixa eu ver', 'vou ver', 'mais tarde', 'depois', 'não decidi', 'vou pesquisar', 'vou analisar', 'vou estudar', 'por enquanto']],
  [{ type: 'authority', label: 'Depende de terceiro' },
    ['minha esposa', 'meu marido', 'meu pai', 'minha mãe', 'patroa', 'preciso ver com', 'vou ver com']],
  [{ type: 'trust', label: 'Dúvida sobre produto' },
    ['seminovo', 'usado', 'original', 'procedência', 'garantia', 'seguro', 'confiável']],
  [{ type: 'competitor', label: 'Concorrente' },
    ['mercado livre', 'shopee', 'olx', 'comprei em outro', 'achei mais barato']],
]

const objecoesDeduzidas = (leadText: string): Objection[] =>
  OBJECOES.filter(([, kws]) => kws.some((k) => leadText.includes(k))).map(([o]) => o)

/**
 * QUEM ATENDEU — fato antes de dedução, e sem lista de nomes no código.
 *
 * O parser tinha três regras, e a do meio varria uma lista fixa de primeiros
 * nomes (`["pedro","matheus","ana","joão",…]`) procurando QUALQUER ocorrência
 * em QUALQUER mensagem da loja. Dois problemas: a lista é dos vendedores da
 * JM, escrita no código (nenhum outro tenant teria vendedor nenhum); e casar
 * em qualquer posição confunde menção com autoria — "o Pedro te atende
 * amanhã" marcava Pedro como o vendedor daquela conversa.
 *
 * O resultado estava na tela: 73% "Loja", e entre os identificados apareciam
 * **"hoje"**, **"Pedroe"** e **"Pedreo"** como pessoas, com o mesmo Pedro
 * dividido em três grafias.
 *
 * Agora: `responsavel_id` do CRM quando existe (fato), senão a
 * auto-apresentação explícita, senão "Loja" — que é a resposta honesta para
 * conversa em que ninguém se apresentou.
 */
const APRESENTACAO = [
  /me chamo\s+([A-ZÀ-Ú][a-zà-ú]{2,})/,
  /meu nome é\s+([A-ZÀ-Ú][a-zà-ú]{2,})/i,
  /aqui é (?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]{2,})/i,
  /sou (?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]{2,})/i,
]

function quemAtendeu(responsavel: string | null | undefined, mensagens: RawMessage[]): string {
  if (responsavel) return responsavel
  for (const m of mensagens) {
    if (!m.isStore) continue
    for (const re of APRESENTACAO) {
      const achou = (m.body || '').match(re)
      if (achou?.[1]) return achou[1]
    }
  }
  return 'Loja'
}

const diasAte = (iso: string | null): number => {
  if (!iso) return 999
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 999 : Math.max(0, Math.floor((Date.now() - t) / DIA_MS))
}

/** `YYYY-MM-DD` e `HH:MM`, que é o formato que as telas e a ficha esperam. */
const dia = (iso: string) => iso.slice(0, 10)
const hora = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Monta os leads analisados a partir das linhas do banco.
 *
 * `msgs` precisa vir em ordem cronológica — `carregarConversas` garante isso
 * ordenando em memória depois de ler por `id` (a paginação paralela exige
 * ordem total, e `created_at` empata porque o webhook grava em lote).
 */
export function montarLeads(porId: Map<number, LeadBanco>, msgs: MsgBanco[]): Lead[] {
  const porLead = new Map<number, RawMessage[]>()

  for (const m of msgs) {
    const banco = porId.get(m.lead_id)
    if (!banco) continue
    const lista = porLead.get(m.lead_id) ?? []
    lista.push({
      date: dia(m.created_at),
      time: hora(m.created_at),
      // O telefone na mensagem serve só para exibição; quem decide o lado é
      // `direcao`. Ver a armadilha multi-tenant no cabeçalho.
      phone: banco.telefone ?? banco.origem_id ?? '',
      name: m.direcao === 'enviada' ? 'Loja' : (banco.nome ?? ''),
      body: m.conteudo ?? '',
      mediaType: m.tipo && m.tipo !== 'texto' ? m.tipo : '',
      mediaCaption: '',
      quotedMessage: '',
      isStore: m.direcao === 'enviada',
    })
    porLead.set(m.lead_id, lista)
  }

  const fora: Lead[] = []

  for (const [leadId, mensagens] of porLead) {
    const banco = porId.get(leadId)!
    const doLead = mensagens.filter((m) => !m.isStore)
    const daLoja = mensagens.filter((m) => m.isStore)

    const primeira = mensagens[0]
    const ultima = mensagens[mensagens.length - 1]
    const firstDate = primeira?.date ?? ''
    const lastDate = ultima?.date ?? ''

    const daysInactive = diasAte(banco.ultima_mensagem_at ?? null)
    const conversationDays = firstDate && lastDate
      ? Math.max(0, Math.round((Date.parse(`${lastDate}T12:00:00`) - Date.parse(`${firstDate}T12:00:00`)) / DIA_MS))
      : 0

    const allText = mensagens.map((m) => m.body).join(' ').toLowerCase()
    const leadText = doLead.map((m) => m.body).join(' ').toLowerCase()

    // Trocas de turno nas primeiras 24 h — o preditor que a calibração achou.
    // Medido só no começo da conversa, antes de qualquer desfecho: sobre a
    // conversa inteira o número seria maior e circular, porque quem compra
    // conversa muito POR TER comprado.
    const t0 = Date.parse(`${firstDate}T${primeira?.time || '00:00'}:00`)
    const inicio = Number.isNaN(t0) ? [] : mensagens.filter((m) => {
      const t = Date.parse(`${m.date}T${m.time || '00:00'}:00`)
      return !Number.isNaN(t) && t - t0 <= DIA_MS
    })
    const trocasInicio = inicio.reduce(
      (n, m, i) => (i > 0 && m.isStore !== inicio[i - 1].isStore ? n + 1 : n), 0,
    )

    const classification = classifyLead({
      leadText, leadMsgs: doLead.length, storeMsgs: daLoja.length,
      daysInactive, messages: mensagens, trocasInicio,
    })
    const score = scoreLead({ classification, leadText, allText, leadMsgs: doLead.length, daysInactive })
    const contact = banco.nome || banco.telefone || banco.origem_id || `Lead ${leadId}`
    const { nextAction, urgency, insight, lossRisk } =
      generateNextAction({ classification, score, daysInactive, leadText, allText, contact })

    fora.push({
      // O id É o id do CRM. Antes era um contador do parser (`lead-0`,
      // `lead-1`…), então a URL da tela do lead não tinha relação com o lead
      // do CRM — e `idDoLead` precisava decodificar o `filename` para achar.
      id: `lead-${leadId}`,
      filename: `lead-${leadId}`,
      contact,
      phone: banco.telefone ?? banco.origem_id ?? '',
      sellerName: quemAtendeu(banco.responsavel_nome, mensagens),
      messages: mensagens,
      classification,
      score,
      buyerProfile: inferProfile(leadText, allText),
      buySignals: sinaisDeCompra(leadText),
      objections: objecoesDeduzidas(leadText),
      daysInactive,
      conversationDays,
      firstDate,
      lastDate,
      totalMessages: mensagens.length,
      leadMessages: doLead.length,
      storeMessages: daLoja.length,
      nextAction,
      urgency,
      insight,
      lossRisk,
      _channel: banco.origem === 'instagram' ? 'instagram' : 'whatsapp',
      crm: {
        leadId,
        filialId: banco.filial_id,
        canal: banco.origem ?? 'whatsapp',
        kanbanStatus: banco.kanban_status ?? null,
        motivoPerda: banco.motivo_perda ?? null,
        perdidoEm: banco.perdido_em ?? null,
        produtoInteressado: banco.produto_interessado ?? null,
        responsavelId: banco.responsavel_id ?? null,
        convertidoEm: banco.convertido_em ?? null,
        anuncio: (banco.anuncio as Record<string, unknown> | null) ?? null,
        criadoEm: banco.created_at,
      },
    })
  }

  return fora.sort((a, b) => b.score - a.score)
}
