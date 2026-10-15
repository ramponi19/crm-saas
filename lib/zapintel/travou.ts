import type { Lead, RawMessage } from '@/types/zapintel'
import { ehFala, indiceDaFalaQueEncerrou, type Ficha } from '@/lib/zapintel/ficha'

/**
 * ONDE A VENDA COMEÇOU A SE PERDER — o ponto exato, dentro da conversa.
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * A ficha já conta o que aconteceu, em prosa. Mas quem abre a conversa para
 * conferir rola 41 mensagens procurando o momento — e o momento é sempre uma
 * mensagem só. Marcar ELA é a diferença entre "esta conversa travou em preço"
 * e "foi aqui, nesta frase, e faz 6 dias".
 *
 * É o que as ferramentas do segmento mostram na vitrine delas, e nós temos a
 * matéria-prima: `indiceDaFalaQueEncerrou` (a regra das 24 h) e as datas.
 *
 * ══ O QUE ESTE MÓDULO NÃO FAZ ══════════════════════════════════════════════
 *
 * Não usa IA, e não adivinha. Ele aponta um FATO verificável — "ele disse isto
 * e ninguém respondeu", "a loja falou isto e ele não voltou". A sugestão do
 * que escrever depois é outra coisa, mora na tela e é claramente marcada como
 * sugestão.
 *
 * E não marca nada em conversa que VIROU VENDA: ali nada travou, e pintar um
 * alerta sobre a venda fechada seria o sistema mentindo com cara de ajuda.
 */

/** Quanto da frase cabe no rótulo. O bastante para reconhecer qual foi. */
const TAMANHO = 120

/** A janela que separa resposta de retomada. A mesma de `ficha.ts`. */
const UM_DIA = 86_400_000

/*
 * Os dois tipos de "objeção" saíram em 15/10/2026: a objeção era achada por
 * palavra-chave do motor de agosto ("garantia" virava "Dúvida sobre produto").
 * As objeções agora vêm da análise de IA, com a frase do cliente e o desfecho.
 * Aqui fica só o que é fato verificável na ordem das mensagens.
 */
export type TipoDeTravamento =
  /** A última fala foi dele. A loja simplesmente deve resposta. */
  | 'loja_deve_resposta'
  /** A loja falou por último, dentro da conversa, e ele sumiu. */
  | 'ele_sumiu'

export interface Travou {
  /**
   * Índice da mensagem em `lead.messages` — a lista CRUA, sem filtro.
   *
   * A tela compara por referência (`lead.messages[indice] === msg`), o que
   * sobrevive ao filtro por canal da conversa fundida. Procurar a frase de
   * volta por texto acharia a errada toda vez que a loja repete a mesma
   * mensagem, que é justamente o caso da frase de retomada.
   */
  indice: number
  tipo: TipoDeTravamento
  /** O rótulo curto da faixa: "Objeção de preço sem resposta". */
  rotulo: string
  /** O tempo em palavras de balcão: "há 6 dias". */
  detalhe: string
  /** De quem é a mensagem marcada. A tela pinta diferente. */
  daLoja: boolean
}

const corpo = (m: RawMessage): string => (m.body || '').trim()

const instante = (m: RawMessage): number => {
  const t = Date.parse(`${m.date}T${(m.time || '00:00')}:00`)
  return Number.isNaN(t) ? 0 : t
}

const faz = (dias: number): string =>
  dias <= 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`


/**
 * Acha o ponto em que a conversa travou. `null` quando não travou.
 *
 * A ordem das regras é a ordem da culpa, da mais acionável para a menos: uma
 * objeção sem resposta é falha de atendimento e tem conserto; "ele sumiu
 * depois de uma resposta correta" é informação, não cobrança.
 */
export function ondeTravou(a: Lead, comprou: boolean): Travou | null {
  if (comprou) return null

  const msgs = a.messages || []
  if (msgs.length < 2) return null

  const dias = a.daysInactive
  const ultima = [...msgs].reverse().find((m) => corpo(m) || m.mediaType)
  if (!ultima) return null

  /** Índice da última coisa que o CLIENTE disse — de qualquer tipo. */
  let iUltimaDele = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (!msgs[i].isStore) { iUltimaDele = i; break }
  }

  // ── 2. A última fala foi dele: a loja deve resposta ──────────────────────
  if (!ultima.isStore) {
    const i = msgs.lastIndexOf(ultima)
    return {
      indice: i,
      tipo: 'loja_deve_resposta',
      rotulo: 'Ele falou por último — a loja não voltou',
      detalhe: faz(dias),
      daLoja: false,
    }
  }

  // ── 3. A loja falou por último. Onde a conversa VIVA terminou? ───────────
  //
  // `indiceDaFalaQueEncerrou` responde isso quando a última fala da loja veio
  // até 24 h depois da dele. Quando não veio, ela não devolve nada — e está
  // certa: a frase de RETOMADA, mandada dias depois para quem já sumiu, não
  // encerrou conversa nenhuma. Ver o cabeçalho de `ficha.ts`.
  //
  // Só que isso deixava 659 conversas da JM (metade das travadas) sem marca
  // nenhuma — justamente as em que a loja JÁ CORREU ATRÁS. São o caso mais
  // útil da tela, não o menos. O travamento delas existe: aconteceu ANTES das
  // retomadas. Então aqui a gente procura o fim da conversa viva ignorando o
  // que veio depois dela.
  const iFim = indiceDaFalaQueEncerrou(a)
  const retomadas = iUltimaDele >= 0
    ? msgs.slice(iUltimaDele + 1).filter((m) => m.isStore && instante(m) - instante(msgs[iUltimaDele]) > UM_DIA).length
    : 0
  const comRetomada = retomadas > 0
    ? `${faz(dias)} · a loja tentou retomar ${retomadas}x`
    : faz(dias)

  if (iFim != null) {
    return {
      indice: iFim,
      tipo: 'ele_sumiu',
      rotulo: 'A loja disse isto e ele não respondeu mais',
      detalhe: comRetomada,
      daLoja: true,
    }
  }

  if (iUltimaDele >= 0) {
    /**
     * A última resposta da loja dentro da conversa viva — QUALQUER mensagem,
     * inclusive áudio.
     *
     * ⚠ Aqui `ehFala` seria o filtro errado, e foi: ele existe para escolher
     * uma FRASE que dê para mostrar num ranking, não para decidir se alguém
     * respondeu. Áudio é resposta. Medido em 12/10: com `ehFala` nesta linha,
     * os leads 747 e 683 — em que a loja respondeu por áudio dentro de uma
     * hora — apareciam como "Ele falou por último, a loja não voltou", com as
     * respostas da loja visíveis logo abaixo na mesma tela.
     *
     * São duas perguntas diferentes e elas precisam de filtros diferentes:
     * "a loja respondeu?" aceita áudio; "que frase mostrar?" não.
     */
    let iResposta = -1
    for (let i = iUltimaDele + 1; i < msgs.length; i++) {
      const m = msgs[i]
      if (!m.isStore) continue
      if (instante(m) - instante(msgs[iUltimaDele]) > UM_DIA) break
      iResposta = i
    }

    if (iResposta >= 0) {
      return {
        indice: iResposta,
        tipo: 'ele_sumiu',
        // O rótulo não pode prometer texto quando a mensagem é um áudio.
        rotulo: ehFala(msgs[iResposta])
          ? 'A loja disse isto e ele não respondeu mais'
          : 'A loja respondeu aqui, e ele não voltou',
        detalhe: comRetomada,
        daLoja: true,
      }
    }

    // Ninguém respondeu dentro de 24 h — a loja só reapareceu dias depois.
    // A culpa aqui é da demora, e a mensagem a marcar é a DELE.
    return {
      indice: iUltimaDele,
      tipo: 'loja_deve_resposta',
      rotulo: retomadas > 0
        ? 'Ele falou, e a loja só voltou dias depois'
        : 'Ele falou por último — a loja não voltou',
      detalhe: comRetomada,
      daLoja: false,
    }
  }

  // Só a loja falou nesta conversa: é disparo, não atendimento.
  return null
}

/**
 * O contexto que a sugestão de resposta precisa — e NADA além dele.
 *
 * Mandar a conversa inteira para a IA seria caro e pior: o modelo se perde em
 * 40 mensagens e devolve genérico. O que decide a próxima mensagem é o que ele
 * pediu, o que a loja ofereceu, onde travou e há quanto tempo.
 */
export function contextoDaSugestao(a: Lead, t: Travou, f?: Ficha): string {
  const m = (a.messages || [])[t.indice]
  const linhas = [
    `Cliente: ${a.contact}`,
    `Situação: ${t.rotulo} (${t.detalhe})`,
    /**
     * O QUE ELE PROCUROU — e por que esta linha vale mais que o ramo do
     * segmento.
     *
     * Medido em produção em 13/10/2026: sem ela, a IA escrevia "ainda tenho
     * suas PEÇAS separadinhas aqui" e "garantir aquele ITEM" para clientes que
     * queriam iPhone. O prompt descrevia o negócio com
     * `getSegment().followupContext`, e a JM cai em `ecommerce`, cujo texto é
     * "Atendente de loja de moda/varejo".
     *
     * O ramo vinha de um mapa (`varejo` → `ecommerce`) que não distingue
     * varejo de celular de varejo de roupa. O que o CLIENTE pediu, nesta
     * conversa, é fato — e descreve o negócio melhor que qualquer rótulo.
     */
    f?.procurou.length ? `O que ele procurou: ${f.procurou.join(', ')}` : '',
    f?.ultimaOferta ? `A última oferta da loja foi: "${f.ultimaOferta.slice(0, TAMANHO)}"` : '',
    m ? `A mensagem onde travou (${m.isStore ? 'loja' : 'cliente'}): "${corpo(m).slice(0, TAMANHO)}"` : '',
    `Inativo há ${a.daysInactive} dia(s).`,
  ]
  return linhas.filter(Boolean).join('\n')
}
