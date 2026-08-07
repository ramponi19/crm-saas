/**
 * Preço de referência do aparelho recebido em troca, e o aviso de quando a loja
 * está pagando caro demais por ele.
 *
 * A troca é o ponto onde a margem some sem aparecer em lugar nenhum: o valor
 * dado ao cliente abate do que ele paga, a venda continua com o preço cheio, e
 * só na revenda o prejuízo aparece — meses depois, sem ninguém ligar uma coisa à
 * outra. Inflar a troca é, inclusive, a forma clássica de disfarçar desconto.
 */

export interface PrecoRef {
  modelo: string
  armazenamento: string | null
  condicao: string
  preco_sugerido: number
}

/** Percentual padrão quando a loja não configurou. */
export const TOLERANCIA_PADRAO = 10

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Acha o preço de referência a partir do texto livre que o vendedor digitou
 * ("iPhone 12 64GB Preto").
 *
 * Aparelho de troca é sempre usado, então a condição `usado` tem prioridade — se
 * a tabela só tiver o preço de novo, usar esse valor como referência mandaria o
 * vendedor pagar preço de novo por um aparelho usado.
 */
export function referenciaDaTroca(texto: string, tabela: PrecoRef[]): number | null {
  const t = norm(texto)
  if (!t || !tabela.length) return null

  const candidatos = tabela.filter((p) => {
    const m = norm(p.modelo)
    return m && (m === t || t.includes(m) || m.includes(t))
  })
  if (!candidatos.length) return null

  // Entre vários, o modelo mais específico que casou (evita "iPhone 12" ganhar
  // de "iPhone 12 Pro Max" quando o texto é do Pro Max).
  const maisEspecifico = [...candidatos].sort((a, b) => norm(b.modelo).length - norm(a.modelo).length)

  const usados = maisEspecifico.filter((p) => p.condicao === 'usado')
  const pool = usados.length ? usados : maisEspecifico.filter((p) => p.condicao === 'seminovo')
  const escolhidos = pool.length ? pool : maisEspecifico

  // Capacidade citada no texto refina ("128GB").
  const comArm = escolhidos.find((p) => p.armazenamento && t.includes(norm(p.armazenamento)))
  return (comArm ?? escolhidos[0]).preco_sugerido
}

export interface AvaliacaoTroca {
  referencia: number
  valor: number
  /** Quanto passou da referência, em reais e em %. */
  excedente: number
  percentual: number
  /** true quando passou da tolerância e exige aceite do vendedor. */
  exigeAceite: boolean
}

/**
 * Compara o valor dado ao cliente com a referência. Só o excesso importa: pagar
 * MENOS que a referência é margem para a loja, não risco.
 */
export function avaliarTroca(valor: number, referencia: number | null, toleranciaPct: number): AvaliacaoTroca | null {
  if (referencia == null || referencia <= 0 || !Number.isFinite(valor) || valor <= 0) return null
  const excedente = valor - referencia
  const percentual = (excedente / referencia) * 100
  return {
    referencia,
    valor,
    excedente,
    percentual,
    exigeAceite: excedente > 0 && percentual > toleranciaPct,
  }
}

/** Texto que vai para o log — precisa se explicar sozinho meses depois. */
export function textoDoAceite(aparelho: string, a: AvaliacaoTroca): string {
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return `Troca acima da referência: "${aparelho || 'aparelho'}" avaliado em ${brl(a.valor)}, `
    + `referência ${brl(a.referencia)} (${a.percentual.toFixed(1)}% acima, ${brl(a.excedente)} a mais). `
    + `O vendedor confirmou estar ciente ao fechar a venda.`
}
