/**
 * Validação e consulta de IMEI.
 *
 * A consulta oficial (consultaaparelhoimpedido.com.br, das operadoras) é
 * protegida por reCAPTCHA: existe para ser feita por uma pessoa. Não há API
 * pública — os serviços que oferecem uma são intermediários pagos que automatizam
 * aquele portal. Então o fluxo aqui é ASSISTIDO: o CRM valida o número, abre o
 * site com o IMEI pronto, e registra o que a pessoa viu.
 *
 * O que dá para fazer sem consultar nada: conferir o dígito verificador. Isso
 * pega erro de digitação na hora — que é o motivo mais comum de uma consulta dar
 * "não encontrado" e o vendedor achar que está tudo bem.
 */

export const URL_CONSULTA_OFICIAL = 'https://www.consultaaparelhoimpedido.com.br/public-web/welcome'

export type ResultadoImei = 'aprovado' | 'reprovado' | 'inconclusivo'

export const RESULTADO_ROTULO: Record<ResultadoImei, string> = {
  aprovado: 'Aprovado — sem impedimento',
  reprovado: 'Reprovado — aparelho impedido',
  inconclusivo: 'Inconclusivo',
}

/** Motivos que o portal apresenta, para o registro não virar texto livre. */
export const MOTIVOS_IMPEDIMENTO = [
  'Roubo', 'Furto', 'Perda', 'Extravio', 'Aparelho irregular (não homologado)', 'Outro',
]

export const soDigitos = (t: string) => (t ?? '').replace(/\D/g, '')

/**
 * Dígito verificador do IMEI (Luhn). 15 dígitos: os 14 primeiros + verificador.
 *
 * Aceita 14 (sem o dígito) como "incompleto", não como inválido — é comum o
 * número vir assim de etiqueta ou nota.
 */
export interface ValidacaoImei {
  digitos: string
  valido: boolean
  motivo: string | null
}

export function validarImei(bruto: string): ValidacaoImei {
  const d = soDigitos(bruto)
  if (!d) return { digitos: d, valido: false, motivo: 'Informe o IMEI' }
  if (d.length < 15) {
    const faltam = 15 - d.length
    const motivo = faltam === 1 ? 'Falta 1 dígito (o IMEI tem 15)' : `Faltam ${faltam} dígitos (o IMEI tem 15)`
    return { digitos: d, valido: false, motivo }
  }
  if (d.length > 15) return { digitos: d, valido: false, motivo: `${d.length} dígitos — o IMEI tem 15` }

  // Luhn: dobra os dígitos de posição par (a partir da direita, base 0 ímpar),
  // soma os algarismos do resultado, e o total tem de fechar em múltiplo de 10.
  let soma = 0
  for (let i = 0; i < 15; i++) {
    let n = Number(d[i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    soma += n
  }
  if (soma % 10 !== 0) {
    return { digitos: d, valido: false, motivo: 'Dígito verificador não confere — confira se digitou certo' }
  }
  return { digitos: d, valido: true, motivo: null }
}

/** Máscara de leitura: 35 878410 123456 7 */
export function formatarImei(bruto: string): string {
  const d = soDigitos(bruto).slice(0, 15)
  const partes = [d.slice(0, 2), d.slice(2, 8), d.slice(8, 14), d.slice(14, 15)].filter(Boolean)
  return partes.join(' ')
}

/**
 * Os 8 primeiros dígitos (TAC) identificam o modelo numa base internacional que
 * não temos aqui. Guardar isso à parte deixa claro o que dá e o que não dá:
 * conseguimos separar aparelhos do mesmo modelo, não dizer QUAL é o modelo.
 */
export const tac = (imei: string) => soDigitos(imei).slice(0, 8)
