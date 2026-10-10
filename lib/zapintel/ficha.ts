import type { Lead, RawMessage } from '@/types/zapintel'

/**
 * A FICHA DO LEAD — o relato do que aconteceu, no lugar da conversa inteira.
 *
 * ══ DE ONDE VEIO ESTA IDEIA ════════════════════════════════════════════════
 *
 * Do Lucas, em 10/10/2026: "ao invés de trazer o histórico de chats por leads
 * por que não trazer onde está, como foi ou está sendo a conversa? Exemplo:
 * procura por iPhone 18 com celular na troca, vendedor não respondeu mais."
 *
 * É o mesmo princípio que as ferramentas do segmento chamam de revisar trechos
 * em vez de médias — "seu monólogo mais longo foi de 6 minutos, vamos ver"
 * ensina; "abaixe seu talk ratio" não ensina nada.
 *
 * ══ O QUE ELA SUBSTITUI, E O QUE NÃO ═══════════════════════════════════════
 *
 * `zapintel_analise` já guarda sinais, objeções, perfil e contagens por lead —
 * dado real e específico. O que não presta ali é o `insight`: ele é escolhido
 * de uma lista pela categoria, então dois leads diferentes recebem a mesma
 * frase. Medido em 10/10/2026, leads 747 e 707, conversas distintas:
 *
 *     "Preocupação com saúde da bateria — reforçar garantia de 6 meses."
 *     "Preocupação com saúde da bateria — reforçar garantia de 6 meses."
 *
 * Ler isso não informa nada: você já sabia a gaveta. A ficha conta o que
 * ACONTECEU naquela conversa. Duas conversas com os mesmos fatos vão produzir
 * o mesmo relato — isso é correto. O defeito era duas conversas com fatos
 * DIFERENTES produzirem a mesma frase.
 *
 * ══ POR QUE A MECÂNICA ENTRA AQUI ══════════════════════════════════════════
 *
 * Monólogo, trocas de turno e perguntas são o que Gong mede em chamada, e
 * traduzem para texto melhor do que parecia: monólogo vira "a loja mandou 6
 * mensagens seguidas sem resposta", e isso é exatamente o tipo de coisa que
 * se corrige quando se vê.
 *
 * Uma coisa que eles NÃO têm e nós temos: a última frase da loja antes de o
 * cliente sumir. Chamada não tem "última mensagem antes do silêncio". Agrupada
 * por lead, ela responde quais frases precedem conversa morta — e o cuidado
 * obrigatório é que isso é CORRELAÇÃO: a tela deve dizer "precedeu silêncio N
 * vezes", nunca "mata venda".
 */

/** Quanto da frase final cabe na ficha. O suficiente para reconhecê-la. */
const TAMANHO_DA_FRASE = 180

export interface Ficha {
  /** Id do lead no CRM. */
  leadId: number
  contato: string
  filialId: number | null
  canal: string
  vendedor: string | null

  /** O relato, montado a partir dos fatos desta conversa. */
  relato: string

  // ── Mecânica da conversa ────────────────────────────────────────────────
  mensagensLead: number
  mensagensLoja: number
  /** Quantas vezes a palavra trocou de lado. Conversa viva troca muito. */
  trocasDeTurno: number
  /** Maior sequência de mensagens da loja sem resposta do cliente. */
  monologoLoja: number
  /** Maior sequência do cliente — o equivalente ao "longest customer story". */
  monologoLead: number
  /** Mensagens da loja que contêm pergunta. */
  perguntasDaLoja: number
  /** Mediana de minutos que a loja levou para responder. */
  respostaMedianaMin: number | null
  /** A pior demora da loja nesta conversa. */
  respostaPiorMin: number | null

  // ── Como está, e como terminou ──────────────────────────────────────────
  primeiraEm: string
  ultimaEm: string
  diasInativo: number
  /** A última fala foi do cliente: a loja deve resposta. */
  aguardandoLoja: boolean
  /**
   * A última coisa que a LOJA disse **dentro de uma conversa viva**, quando
   * depois dela o cliente não voltou. É a "frase antes do silêncio".
   *
   * ⚠ O CUIDADO QUE FAZ ESTE CAMPO VALER ALGUMA COISA: só conta se a loja
   * falou logo depois do cliente (até 24 h). Sem esse corte, o campeão do
   * ranking vira "Bora levar esse iPhone novo pra casa?" — que é a frase de
   * RETOMADA, mandada dias depois para quem já tinha sumido. Ela não encerrou
   * conversa nenhuma: foi mandada porque a conversa já estava encerrada.
   * Contá-la seria inverter causa e efeito e culpar o vendedor por insistir.
   *
   * `null` quando quem ficou devendo resposta foi a loja, ou quando a última
   * fala foi tentativa de retomada.
   */
  fraseAntesDoSilencio: string | null
  /**
   * Quantas vezes a loja tentou reanimar a conversa depois de o cliente sumir
   * (mensagem enviada com mais de 24 h de silêncio dele).
   */
  tentativasDeRetomada: number

  // ── Conteúdo ────────────────────────────────────────────────────────────
  /** O que o CLIENTE pediu, nas palavras dele. */
  procurou: string[]
  sinais: string[]
  objecoes: string[]

  // ── Resultado ───────────────────────────────────────────────────────────
  comprou: boolean
  valorVenda: number | null
  diasAteVenda: number | null
}

/** O que o cliente pediu. Lido só da fala DELE — a loja oferece, ele pede. */
const MODELOS: [string, string][] = [
  ['17 pro max', 'iPhone 17 Pro Max'], ['17 pro', 'iPhone 17 Pro'], ['iphone 17', 'iPhone 17'],
  ['16 pro max', 'iPhone 16 Pro Max'], ['16 pro', 'iPhone 16 Pro'], ['iphone 16', 'iPhone 16'],
  ['15 pro max', 'iPhone 15 Pro Max'], ['15 pro', 'iPhone 15 Pro'], ['iphone 15', 'iPhone 15'],
  ['iphone 14', 'iPhone 14'], ['iphone 13', 'iPhone 13'], ['iphone 12', 'iPhone 12'],
  ['iphone 11', 'iPhone 11'], ['macbook', 'MacBook'], ['ipad', 'iPad'],
  ['apple watch', 'Apple Watch'], ['airpod', 'AirPods'], ['212 vip', 'Perfume 212 VIP'],
]

/**
 * Sinais que dizem a mesma coisa com nomes diferentes.
 *
 * O motor emite "Pediu nota fiscal" e "Pediu NF" para a mesma frase, e a ficha
 * saía com os dois lado a lado, o que faz o relato parecer máquina. Some um.
 */
const SINAL_REPETIDO: Record<string, string> = {
  'Pediu nota fiscal': 'Pediu NF',
}

const PALAVRAS_DE_TROCA = ['troca', 'na troca', 'dou o meu', 'entrada o meu', 'meu aparelho']

const quando = (m: RawMessage): number => {
  const t = Date.parse(`${m.date}T${(m.time || '00:00')}:00`)
  return Number.isNaN(t) ? 0 : t
}

const texto = (m: RawMessage): string => (m.body || '').trim()

/**
 * O corpo é uma frase de verdade, ou é marcador de mídia?
 *
 * "Vídeo enviado pelo celular" aparecia 54 vezes no ranking de frases antes do
 * silêncio, e "{shortcode:...}" (post do Instagram compartilhado) 53. Nenhuma
 * das duas é coisa que alguém falou — são o sistema descrevendo um anexo. Com
 * elas dentro, o ranking mede o que foi anexado, não o que foi dito.
 */
function ehFala(m: RawMessage): boolean {
  if (m.mediaType) return false
  const t = texto(m)
  if (t.length < 4) return false
  return !/^(\[|\{)|enviad[ao] pelo celular$|^mensagem com bot/i.test(t)
}

/** Minutos que a loja levou para responder, cada vez que respondeu. */
function esperas(msgs: RawMessage[]): number[] {
  const fora: number[] = []
  for (let i = 1; i < msgs.length; i++) {
    // Só conta a PRIMEIRA resposta da loja depois de uma fala do cliente: as
    // seguintes são continuação da mesma resposta, e contá-las puxaria a
    // mediana para zero.
    if (!msgs[i].isStore || msgs[i - 1].isStore) continue
    const a = quando(msgs[i - 1]); const b = quando(msgs[i])
    if (!a || !b || b < a) continue
    fora.push(Math.round((b - a) / 60000))
  }
  return fora
}

const mediana = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Maior sequência de mensagens do mesmo lado. */
function maiorSequencia(msgs: RawMessage[], daLoja: boolean): number {
  let maior = 0; let atual = 0
  for (const m of msgs) {
    if (m.isStore === daLoja) { atual++; if (atual > maior) maior = atual } else atual = 0
  }
  return maior
}

const horas = (min: number): string =>
  min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)} dias`

/**
 * Monta o relato a partir dos fatos — nunca de uma lista por categoria.
 *
 * Cada frase só entra se o fato existir. Conversa de três mensagens produz
 * relato de uma linha, e está certo: inventar narrativa para conversa que não
 * teve nada é o mesmo defeito do `insight` que isto veio substituir.
 */
function montarRelato(f: Omit<Ficha, 'relato'>): string {
  const partes: string[] = []

  if (f.procurou.length) {
    partes.push(`Procurou ${f.procurou.slice(0, 3).join(', ')}.`)
  }
  if (f.sinais.length) {
    partes.push(`${f.sinais.slice(0, 4).join(', ')}.`)
  }
  if (f.objecoes.length) {
    partes.push(`Travou em: ${f.objecoes.join(', ')}.`)
  }

  // A mecânica só vira frase quando diz algo. Monólogo de 2 é conversa normal.
  const mec: string[] = []
  if (f.tentativasDeRetomada >= 2) {
    mec.push(`a loja tentou retomar ${f.tentativasDeRetomada} vezes depois que ele sumiu`)
  }
  if (f.monologoLoja >= 3) mec.push(`a loja mandou ${f.monologoLoja} mensagens seguidas sem resposta`)
  if (f.respostaMedianaMin != null && f.respostaMedianaMin >= 60) {
    mec.push(`demorou ${horas(f.respostaMedianaMin)} para responder, em média`)
  }
  if (f.mensagensLoja > 0 && f.perguntasDaLoja === 0 && f.mensagensLoja >= 4) {
    mec.push('a loja não fez nenhuma pergunta')
  }
  if (mec.length) {
    const frase = mec.join('; ')
    partes.push(`${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`)
  }

  // O fecho: como a conversa terminou é o que diz o que fazer agora.
  if (f.comprou) {
    const v = f.valorVenda ? ` (${f.valorVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })})` : ''
    const d = f.diasAteVenda != null ? ` ${f.diasAteVenda} dia${f.diasAteVenda === 1 ? '' : 's'} depois do primeiro contato` : ''
    partes.push(`Comprou${v}${d}.`)
  } else if (f.aguardandoLoja) {
    partes.push(`Ele falou por último e a loja não voltou — há ${f.diasInativo} dia${f.diasInativo === 1 ? '' : 's'}.`)
  } else if (f.fraseAntesDoSilencio) {
    partes.push(`A loja disse "${f.fraseAntesDoSilencio}" e ele não respondeu mais — há ${f.diasInativo} dia${f.diasInativo === 1 ? '' : 's'}.`)
  }

  return partes.join(' ') || 'Conversa sem conteúdo suficiente para relatar.'
}

/**
 * A frase da loja que ENCERROU uma conversa viva — ou `null`.
 *
 * Mora fora de `montarFicha` porque o agregado de frases (o ranking de "o que
 * foi dito antes de o cliente sumir") precisa dela sobre 2.061 conversas, e
 * duas implementações da mesma regra divergiriam na primeira mudança.
 *
 * As duas condições que a tornam honesta:
 *  · a fala precisa ser FALA (`ehFala`) — "Vídeo enviado pelo celular"
 *    aparecia 54 vezes no ranking antes deste filtro;
 *  · precisa ter vindo até 24 h depois da última mensagem DELE. Sem isso o
 *    topo do ranking vira a frase de retomada, mandada dias depois para quem
 *    já tinha sumido — que não encerrou nada, foi mandada porque já tinha
 *    acabado. Esse corte derrubou a amostra de 740 para 418 conversas.
 */
export function falaQueEncerrou(a: Lead): string | null {
  const msgs = (a.messages || []).filter((m) => texto(m) || m.mediaType)
  const ultimaDoCliente = [...msgs].reverse().find((m) => !m.isStore)
  if (!ultimaDoCliente) return null
  const ultimaFala = [...msgs].reverse().find(ehFala)
  if (!ultimaFala || !ultimaFala.isStore) return null
  if (quando(ultimaFala) - quando(ultimaDoCliente) > 86_400_000) return null
  return texto(ultimaFala).slice(0, TAMANHO_DA_FRASE)
}

export interface ContextoDaFicha {
  leadId: number
  filialId: number | null
  canal: string
  comprou: boolean
  valorVenda: number | null
  diasAteVenda: number | null
}

/** Produz a ficha de UM lead já analisado. */
export function montarFicha(a: Lead, ctx: ContextoDaFicha): Ficha {
  const msgs = (a.messages || []).filter((m) => texto(m) || m.mediaType)
  const comTexto = msgs.filter((m) => texto(m))
  const ultima = comTexto[comTexto.length - 1]

  const falaDoCliente = comTexto.filter((m) => !m.isStore).map((m) => texto(m).toLowerCase()).join(' ')
  // SÓ O MAIS ESPECÍFICO. A lista está em ordem do mais longo para o mais
  // curto, e "iphone 17 pro max" contém "17 pro" e "iphone 17" — sem parar no
  // primeiro, a ficha dizia "Procurou iPhone 17 Pro Max, iPhone 17 Pro,
  // iPhone 17" para quem pediu um aparelho só.
  const procurou: string[] = []
  const achado = MODELOS.find(([chave]) => falaDoCliente.includes(chave))
  if (achado) procurou.push(achado[1])
  if (PALAVRAS_DE_TROCA.some((k) => falaDoCliente.includes(k))) procurou.push('com aparelho na troca')

  const esperasDaLoja = esperas(msgs)

  // ── A CONVERSA MORREU COMO? ───────────────────────────────────────────────
  //
  // A loja falou por último não basta. Precisa saber se ela falou DENTRO da
  // conversa (resposta a algo que ele disse) ou DEPOIS dela (tentando
  // reanimar alguém que já tinha sumido). Ver `fraseAntesDoSilencio`.
  const UM_DIA = 86_400_000
  const ultimaDoCliente = [...msgs].reverse().find((m) => !m.isStore)
  const marcoDoCliente = ultimaDoCliente ? quando(ultimaDoCliente) : 0
  const tentativasDeRetomada = marcoDoCliente
    ? msgs.filter((m) => m.isStore && quando(m) - marcoDoCliente > UM_DIA).length
    : 0


  const base: Omit<Ficha, 'relato'> = {
    leadId: ctx.leadId,
    contato: a.contact,
    filialId: ctx.filialId,
    canal: ctx.canal,
    vendedor: a.sellerName || null,

    mensagensLead: a.leadMessages,
    mensagensLoja: a.storeMessages,
    trocasDeTurno: msgs.reduce((n, m, i) => (i > 0 && m.isStore !== msgs[i - 1].isStore ? n + 1 : n), 0),
    monologoLoja: maiorSequencia(msgs, true),
    monologoLead: maiorSequencia(msgs, false),
    perguntasDaLoja: comTexto.filter((m) => m.isStore && texto(m).includes('?')).length,
    respostaMedianaMin: mediana(esperasDaLoja),
    respostaPiorMin: esperasDaLoja.length ? Math.max(...esperasDaLoja) : null,

    primeiraEm: a.firstDate,
    ultimaEm: a.lastDate,
    diasInativo: a.daysInactive,
    aguardandoLoja: !!ultima && !ultima.isStore,
    fraseAntesDoSilencio: falaQueEncerrou(a),
    tentativasDeRetomada,

    procurou,
    sinais: [...new Set((a.buySignals ?? []).map((x) => SINAL_REPETIDO[x] ?? x))],
    objecoes: (a.objections ?? []).map((o) => o.label),

    comprou: ctx.comprou,
    valorVenda: ctx.valorVenda,
    diasAteVenda: ctx.diasAteVenda,
  }

  return { ...base, relato: montarRelato(base) }
}
