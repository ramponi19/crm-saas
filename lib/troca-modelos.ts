/**
 * As LINHAS da matriz de troca: um par modelo + armazenamento por linha.
 *
 * ══ DE ONDE SAI A LISTA ════════════════════════════════════════════════════
 *
 * De `lib/apple-modelos.ts`, que já é a lista curada da Apple usada no cadastro
 * de Produto (iPhone 17 até o 6, com os armazenamentos oficiais de cada um).
 * Uma segunda lista aqui faria "iPhone 14 128GB" e "iPhone 14 128 GB" virarem
 * dois aparelhos diferentes entre o estoque e a cotação. Aparelho novo entra em
 * um lugar só.
 *
 * Só `linha: 'iPhone'` — iPad, Mac e Watch não têm matriz de troca nem
 * checklist de Face ID/Doc de carga. Quando tiverem, é outra matriz.
 *
 * ══ POR QUE AGRUPAR POR GERAÇÃO ════════════════════════════════════════════
 *
 * São 63 linhas × 12 colunas. Aberto tudo, é uma parede de campos vazios que
 * ninguém termina. Agrupado por geração, o lojista abre "iPhone 14", preenche
 * as quatro linhas que ele compra, e fecha.
 *
 * A geração é o NÚMERO, não o nome comercial: 17e, 17, 17 Pro e 17 Pro Max são
 * a mesma família. iPhone Air e os SE não têm número — cada um é a sua própria
 * família, na ordem em que a Apple os lançou.
 */

import { APPLE_MODELOS } from './apple-modelos'

export interface LinhaTroca {
  modelo: string
  armazenamento: string
}

export interface FamiliaTroca {
  /** Rótulo da caixa recolhível: 'iPhone 17', 'iPhone SE', 'iPhone Air'. */
  label: string
  linhas: LinhaTroca[]
}

/** 'iPhone 17 Pro Max' → '17'; 'iPhone SE (3ª geração)' → 'SE'; 'iPhone Air' → 'Air'. */
function geracaoDe(nome: string): string {
  const semPrefixo = nome.replace(/^iPhone\s*/i, '')
  const num = semPrefixo.match(/^(\d+)/)
  if (num) return num[1]
  if (/^SE/i.test(semPrefixo)) return 'SE'
  if (/^Air/i.test(semPrefixo)) return 'Air'
  // 'XS Max', 'XR', 'X' — X sozinho não pode engolir XS e XR, por isso a ordem.
  if (/^XS/i.test(semPrefixo)) return 'XS'
  if (/^XR/i.test(semPrefixo)) return 'XR'
  if (/^X/i.test(semPrefixo)) return 'X'
  return semPrefixo
}

/**
 * Ordem das famílias: mais nova primeiro, porque é o que a loja mais avalia.
 *
 * As sem número entram onde a Apple as lançou: o Air é da geração 17 e vem
 * logo depois dela; os X ficam entre o 11 e o 8; o SE, que atravessa gerações,
 * vai depois do 15 — é onde o modelo de referência o coloca.
 *
 * `6s` NÃO está na lista de propósito: '6s' começa com dígito, então
 * `geracaoDe` já o devolve como '6' e ele cai na mesma caixa do iPhone 6.
 * Deixar a entrada aqui sugeriria uma família que a função nunca produz.
 */
const ORDEM_FAMILIA = ['17', 'Air', '16', '15', 'SE', '14', '13', '12', '11', 'XS', 'XR', 'X', '8', '7', '6']

const posicao = (g: string) => {
  const i = ORDEM_FAMILIA.indexOf(g)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/** As famílias com as linhas de cada uma, na ordem em que a tela mostra. */
export function familiasDeTroca(): FamiliaTroca[] {
  const porGeracao = new Map<string, LinhaTroca[]>()

  for (const m of APPLE_MODELOS) {
    if (m.linha !== 'iPhone') continue
    const g = geracaoDe(m.nome)
    const lista = porGeracao.get(g) ?? []
    for (const arm of m.armazenamentos) lista.push({ modelo: m.nome, armazenamento: arm })
    porGeracao.set(g, lista)
  }

  return [...porGeracao.entries()]
    .sort((a, b) => posicao(a[0]) - posicao(b[0]))
    .map(([g, linhas]) => ({
      // 'iPhone 17', 'iPhone Air', 'iPhone SE' — o prefixo volta no rótulo.
      label: `iPhone ${g}`,
      linhas,
    }))
}

/** Chave estável de uma linha, para casar tela e banco. */
export const chaveLinha = (modelo: string, armazenamento: string) => `${modelo}|${armazenamento}`

/** 'iPhone 14 Pro' + '256GB' → 'iPhone 14 Pro 256GB'. Vazio não deixa espaço. */
export const nomeCompleto = (modelo: string, armazenamento: string) =>
  armazenamento ? `${modelo} ${armazenamento}` : modelo
