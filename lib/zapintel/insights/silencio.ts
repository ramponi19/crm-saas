import type { Lead } from '@/types/zapintel'
import { falaQueEncerrou } from '@/lib/zapintel/ficha'

/**
 * O QUE A LOJA DISSE ANTES DE O CLIENTE SUMIR.
 *
 * ══ POR QUE ISTO NÃO EXISTE NAS FERRAMENTAS DO SEGMENTO ════════════════════
 *
 * Gong, Clari e companhia analisam CHAMADA gravada. Chamada não tem "última
 * mensagem antes de sumir": ela acaba quando alguém desliga. Conversa de texto
 * tem — e a última coisa dita fica lá, datada, esperando. É a única métrica
 * desta reconstrução em que o formato assíncrono é melhor que o deles.
 *
 * ══ AS DUAS ARMADILHAS, E ELAS SÃO GRAVES ══════════════════════════════════
 *
 * 1. **Causalidade invertida.** A frase mais comum antes do silêncio era
 *    "Bora levar esse iPhone novo pra casa?", 12 vezes. Só que ela é a frase
 *    de RETOMADA — mandada dias depois para quem já tinha sumido. Ela não
 *    matou conversa nenhuma; foi mandada porque a conversa já estava morta.
 *    Contá-la é culpar o vendedor por insistir. O corte de 24 h em
 *    `falaQueEncerrou` resolve isso, e derrubou a amostra de 740 para 418.
 *
 * 2. **Correlação não é causa, e aqui a tentação é enorme.** Mesmo depois do
 *    corte, "o que você acha?" aparecer 10 vezes NÃO significa que a pergunta
 *    afasta. Pode ser a pergunta que se faz depois de mandar um preço alto —
 *    e o preço é que afastou. Por isso tudo aqui se chama "precedeu", nunca
 *    "causou", e a tela repete isso.
 *
 * ══ POR QUE AGRUPAR POR FORMA, E NÃO POR TEXTO EXATO ═══════════════════════
 *
 * "Bora levar esse iPhone novo pra casa?" e "Bora levar ele pra casa?" são a
 * mesma jogada. Número vira `#` e pontuação some, para que variação de valor e
 * de ênfase ("??!") não vire frase diferente. O exemplo mostrado é o texto
 * real de uma delas, não a forma normalizada — ninguém reconhece a própria
 * frase depois de normalizada.
 */

/** Abaixo disto é coincidência, não padrão. */
const MINIMO_DE_VEZES = 3

/** Frase curta demais não identifica nada ("ok", "sim", "👍"). */
const MINIMO_DE_LETRAS = 12

/** Conversa parada há menos que isto ainda pode voltar. Não é silêncio. */
const DIAS_PARA_SILENCIO = 7

export interface FraseAntesDoSilencio {
  /** O texto real de uma das ocorrências — o que a pessoa reconhece. */
  frase: string
  /** Em quantas conversas essa mesma jogada foi a última coisa dita. */
  vezes: number
  /** Dessas, quantas acabaram em venda assim mesmo. */
  venderamMesmoAssim: number
}

const normalizar = (s: string) =>
  s.toLowerCase()
    .replace(/[0-9]+/g, '#')
    .replace(/[^\p{L}\s#]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

/**
 * O ranking. `comprou` diz se aquele lead acabou comprando — uma frase que
 * precede silêncio mas vende às vezes é bem diferente de uma que nunca vende.
 */
export function computeSilencio(
  leads: Lead[],
  comprou: (l: Lead) => boolean,
): FraseAntesDoSilencio[] {
  const grupos = new Map<string, FraseAntesDoSilencio>()

  for (const lead of leads) {
    if (lead.daysInactive <= DIAS_PARA_SILENCIO) continue
    const frase = falaQueEncerrou(lead)
    if (!frase) continue
    const chave = normalizar(frase)
    if (chave.replace(/[^\p{L}]/gu, '').length < MINIMO_DE_LETRAS) continue

    const g = grupos.get(chave) ?? { frase, vezes: 0, venderamMesmoAssim: 0 }
    g.vezes++
    if (comprou(lead)) g.venderamMesmoAssim++
    grupos.set(chave, g)
  }

  return [...grupos.values()]
    .filter((g) => g.vezes >= MINIMO_DE_VEZES)
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, 10)
}
