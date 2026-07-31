// Valor em reais escrito por extenso — exigido no contrato ("R$ 5.000,00
// (cinco mil reais)"). Portado do CRM antigo da JM, com dois defeitos dele
// corrigidos: centavos eram ignorados e valores em milhao quebravam.

const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos']

/** Escreve 1..999. */
function trio(x: number): string {
  if (x === 0) return ''
  if (x === 100) return 'cem'
  let r = ''
  if (x >= 100) { r += CEN[Math.floor(x / 100)]; x %= 100; if (x) r += ' e ' }
  if (x >= 20) { r += DEZ[Math.floor(x / 10)]; x %= 10; if (x) r += ' e ' }
  if (x > 0 && x < 20) r += UN[x]
  return r
}

/** Escreve a parte inteira, tratando milhar e milhao. */
function inteiro(n: number): string {
  if (n === 0) return 'zero'
  const partes: string[] = []
  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000

  if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : `${trio(milhoes)} milhões`)
  if (milhares) partes.push(milhares === 1 ? 'mil' : `${trio(milhares)} mil`)
  if (resto) partes.push(trio(resto))

  // "mil e duzentos" / "um milhão e quinhentos mil"; vírgula quando ha 3 blocos.
  if (partes.length === 1) return partes[0]
  if (partes.length === 2) return `${partes[0]} e ${partes[1]}`
  return `${partes[0]}, ${partes[1]} e ${partes[2]}`
}

/**
 * "cinco mil reais", "mil duzentos e cinquenta reais e trinta centavos".
 * Retorna em minusculas — quem imprime decide o caixa.
 */
export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(valor || 0) * 100)
  const reais = Math.floor(centavosTotais / 100)
  const centavos = centavosTotais % 100

  const pReais = reais === 1 ? 'um real' : `${inteiro(reais)} reais`
  if (centavos === 0) return pReais
  const pCent = centavos === 1 ? 'um centavo' : `${inteiro(centavos)} centavos`
  // Valor só de centavos não menciona reais.
  return reais === 0 ? pCent : `${pReais} e ${pCent}`
}
