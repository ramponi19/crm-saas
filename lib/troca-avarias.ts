/**
 * As avarias que descontam do valor de troca — e o bônus que soma.
 *
 * ══ POR QUE ISTO É DADO, E NÃO JSX ═════════════════════════════════════════
 *
 * As mesmas onze avarias aparecem em TRÊS lugares: as colunas da matriz de
 * preços, as caixas do passo 2 da cotação, e os chips "reprovou? marque" do
 * checklist. Escritas na tela, acrescentar uma avaria significa achar os três
 * lugares — e o terceiro que ninguém achar vira uma coluna sem caixa, ou um
 * chip que aponta para uma avaria que não existe mais.
 *
 * A `chave` é o que vai para o banco (`troca_precos.descontos` e
 * `troca_cotacoes.avarias`). Renomear chave publicada quebra cotação já
 * emitida: acrescente uma nova em vez de renomear.
 *
 * ══ A ORDEM IMPORTA ════════════════════════════════════════════════════════
 *
 * É a ordem das colunas da matriz e das caixas da cotação, e vai do que se vê
 * de olho (marcas, tela) para o que só aparece ligando o aparelho (notificação
 * de peça). É a sequência em que o vendedor examina o aparelho no balcão.
 */

export interface Avaria {
  /** Vai para o banco. Não renomeie depois de publicada. */
  chave: string
  label: string
  /** O ⓘ da coluna: onde se confirma essa avaria no próprio aparelho. */
  ajuda: string
}

export const AVARIAS: Avaria[] = [
  { chave: 'marcas_leves', label: 'Marcas leves',
    ajuda: 'Riscos finos que só aparecem na luz, sem trinco. Aparelho de uso normal.' },
  { chave: 'marcas_moderadas', label: 'Marcas moderadas',
    ajuda: 'Riscos fundos, amassados na carcaça ou quina batida. Não acumula com "marcas leves" — marque só um dos dois.' },
  { chave: 'bateria', label: 'Bateria (saúde baixa)',
    ajuda: 'Ajustes › Bateria › Saúde da bateria, abaixo do corte da sua loja.' },
  { chave: 'tela', label: 'Troca de tela',
    ajuda: 'Trincada, estourada, com mancha/queimado/linha, ou região que não responde ao toque.' },
  { chave: 'traseira', label: 'Traseira',
    ajuda: 'Vidro de trás trincado ou estourado.' },
  { chave: 'face_id', label: 'Face ID',
    ajuda: 'Não cadastra rosto novo, ou aparece "indisponível". No 8/8 Plus, o mesmo teste com Touch ID.' },
  { chave: 'doc_carga', label: 'Doc de carga',
    ajuda: 'Conector de carga falhando ou que só funciona numa posição do cabo.' },
  { chave: 'camera_traseira', label: 'Câmera traseira',
    ajuda: 'Alguma lente sem foco, com mancha ou tremido — ou que não abre.' },
  { chave: 'notif_camera', label: 'Notif. peça · câmera',
    ajuda: 'Ajustes › Geral › Sobre acusa câmera desconhecida ou não genuína.' },
  { chave: 'notif_bateria', label: 'Notif. peça · bateria',
    ajuda: 'Ajustes › Geral › Sobre acusa bateria desconhecida ou não genuína.' },
  { chave: 'notif_tela', label: 'Notif. peça · tela',
    ajuda: 'Ajustes › Geral › Sobre acusa tela desconhecida ou não genuína.' },
]

export const AVARIA_POR_CHAVE: Record<string, Avaria> =
  Object.fromEntries(AVARIAS.map((a) => [a.chave, a]))

/**
 * O único item que SOMA em vez de descontar.
 *
 * Fica separado das avarias porque o sinal é outro, e porque não é uma condição
 * do aparelho: é uma condição do NEGÓCIO. Misturado na mesma lista, apareceria
 * como coluna da matriz de avarias e como item do checklist de defeitos — nos
 * dois casos, no lugar errado.
 */
export const BONUS_LEVA_SEMINOVO = {
  chave: 'leva_seminovo',
  label: 'Cliente vai levar outro seminovo do nosso estoque',
  ajuda: 'Bônus de negociação: o aparelho sai do estoque no mesmo atendimento.',
}

/** Quanto essa avaria desconta neste modelo. Ausente = zero, não bloqueio. */
export function descontoDe(descontos: Record<string, unknown> | null | undefined, chave: string): number {
  const v = descontos?.[chave]
  return typeof v === 'number' ? v : Number(v) || 0
}

export interface ContaTroca {
  base: number
  descontos: number
  bonus: number
  /**
   * Nunca negativo: uma soma de avarias maior que a base significa "não vale
   * nada na troca", não "o cliente paga a loja para entregar o aparelho".
   */
  total: number
}

/**
 * A conta do passo 3, num lugar só.
 *
 * Chamada na tela (para mostrar ao vivo) e na rota de salvar (que é a que
 * vale). Duas contas divergiriam na primeira regra nova — e o número na tela
 * não seria o número gravado.
 */
export function calcularTroca(
  base: number,
  descontos: Record<string, unknown> | null | undefined,
  marcadas: string[],
  bonus: number,
): ContaTroca {
  const somaDescontos = marcadas
    .filter((c) => c !== BONUS_LEVA_SEMINOVO.chave)
    .reduce((s, c) => s + descontoDe(descontos, c), 0)
  const b = marcadas.includes(BONUS_LEVA_SEMINOVO.chave) ? bonus : 0
  return {
    base,
    descontos: somaDescontos,
    bonus: b,
    total: Math.max(0, base - somaDescontos + b),
  }
}
