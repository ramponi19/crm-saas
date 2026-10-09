import type { Lead } from '@/types/zapintel'

/**
 * COMO A LOJA FALA EM CONVERSA QUE FECHA E EM CONVERSA QUE PERDE.
 *
 * Este cálculo morava dentro de `app/zapintel/linguagem/page.tsx`, num `useMemo`
 * sobre `lead.messages`. Ficar lá significava que a tela só existia enquanto o
 * navegador tivesse o texto das conversas inteiras na memória — e era isso que
 * obrigava a mandar 54 mil mensagens pela rede.
 *
 * Como função pura sobre `Lead[]`, roda igual nos dois lados; hoje roda no
 * servidor, perto do dado, e só o resultado (alguns KB) viaja.
 */

/** Palavras associadas a conversa que fechou. */
const PALAVRAS_FORTES = [
  'olha', 'perfeito', 'excelente', 'ótimo', 'bacana', 'certinho', 'show', 'manda', 'mandei', 'foto',
  'garantia', 'segurança', 'confiança', 'parcela', 'entrada', 'facilita', 'exclusivo', 'especial',
  'só pra você', 'reservei', 'último', 'chegou agora', 'zero km', 'aprovado',
]

/** Palavras associadas a conversa que esfriou. */
const PALAVRAS_FRACAS = [
  'não sei', 'qualquer coisa', 'qualquer dúvida', 'quando quiser', 'sem pressão', 'à vontade',
  'pode ser', 'talvez', 'se quiser', 'não tem problema', 'tudo bem se não', 'não precisa',
]

/** Muletas: não decidem a venda, mas medem o quanto a resposta é automática. */
const PALAVRAS_A_EVITAR = [
  'entendido', 'compreendido', 'certo', 'ok', 'okay', 'tá', 'né',
]

const FRASES = [
  'garantia de', 'aceita como entrada', 'parcela em', 'só restou', 'reservar pra você',
  'mandei a foto', 'chegou agora', 'posso ver', 'vou verificar', 'tô te mandando',
  'aqui na jm', 'melhor custo', 'você confia', 'já atendi', 'cliente meu',
]

export interface EstatisticaPalavra {
  word: string
  winCount: number
  lossCount: number
  totalCount: number
  winRate: number
}

export interface EstatisticaFrase {
  phrase: string
  winCount: number
  lossCount: number
}

export interface LinguagemStats {
  winLeads: number
  lossLeads: number
  winMsgs: number
  lossMsgs: number
  powerStats: EstatisticaPalavra[]
  weakStats: EstatisticaPalavra[]
  avoidUsage: { word: string; count: number }[]
  avgWinMsgLen: number
  avgLossMsgLen: number
  winEmojiPct: number
  lossEmojiPct: number
  winQPct: number
  lossQPct: number
  phraseStats: EstatisticaFrase[]
}

const tokenizar = (texto: string): string[] =>
  texto.toLowerCase().replace(/[^\w\sàáâãäéêëíïóôõöúüçñ]/g, '').split(/\s+/).filter(Boolean)

const contarFrase = (textos: string[], frase: string): number =>
  textos.filter((t) => t.toLowerCase().includes(frase)).length

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0)

function compararPalavras(lista: string[], ganhas: string[], perdidas: string[]): EstatisticaPalavra[] {
  return lista.map((w) => {
    const winCount = ganhas.filter((t) => t.includes(w)).length
    const lossCount = perdidas.filter((t) => t.includes(w)).length
    const totalCount = winCount + lossCount
    return { word: w, winCount, lossCount, totalCount, winRate: pct(winCount, totalCount) }
  }).filter((s) => s.totalCount > 0)
}

export function computeLinguagem(leads: Lead[]): LinguagemStats | null {
  if (!leads.length) return null

  const ganhos = leads.filter((l) => l.classification === 'customer' || l.classification === 'hot')
  const perdidos = leads.filter((l) => l.classification === 'lost' || l.classification === 'stalled')

  // Só o lado da loja: o que está em julgamento é a fala do vendedor.
  const daLoja = (ls: Lead[]) => ls.flatMap((l) => (l.messages || []).filter((m) => m.isStore).map((m) => m.body || ''))
  const msgsGanhas = daLoja(ganhos)
  const msgsPerdidas = daLoja(perdidos)
  const msgsTodas = daLoja(leads)

  const tokensGanhos = msgsGanhas.flatMap(tokenizar)
  const tokensPerdidos = msgsPerdidas.flatMap(tokenizar)

  const emoji = /[\u{1F300}-\u{1FFFF}]/u
  const media = (ms: string[]) => (ms.length > 0 ? Math.round(ms.reduce((s, m) => s + m.length, 0) / ms.length) : 0)

  return {
    winLeads: ganhos.length,
    lossLeads: perdidos.length,
    winMsgs: msgsGanhas.length,
    lossMsgs: msgsPerdidas.length,

    powerStats: compararPalavras(PALAVRAS_FORTES, tokensGanhos, tokensPerdidos)
      .sort((a, b) => b.winRate - a.winRate).slice(0, 12),
    weakStats: compararPalavras(PALAVRAS_FRACAS, tokensGanhos, tokensPerdidos)
      .sort((a, b) => a.winRate - b.winRate).slice(0, 8),
    avoidUsage: PALAVRAS_A_EVITAR
      .map((w) => ({ word: w, count: msgsTodas.filter((m) => m.toLowerCase().includes(w)).length }))
      .filter((s) => s.count > 0).sort((a, b) => b.count - a.count),

    avgWinMsgLen: media(msgsGanhas),
    avgLossMsgLen: media(msgsPerdidas),
    winEmojiPct: pct(msgsGanhas.filter((m) => emoji.test(m)).length, msgsGanhas.length),
    lossEmojiPct: pct(msgsPerdidas.filter((m) => emoji.test(m)).length, msgsPerdidas.length),
    winQPct: pct(msgsGanhas.filter((m) => m.includes('?')).length, msgsGanhas.length),
    lossQPct: pct(msgsPerdidas.filter((m) => m.includes('?')).length, msgsPerdidas.length),

    phraseStats: FRASES
      .map((p) => ({ phrase: p, winCount: contarFrase(msgsGanhas, p), lossCount: contarFrase(msgsPerdidas, p) }))
      .filter((s) => s.winCount + s.lossCount > 0)
      .sort((a, b) => (b.winCount - b.lossCount) - (a.winCount - a.lossCount))
      .slice(0, 10),
  }
}
