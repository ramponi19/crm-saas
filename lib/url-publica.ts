/**
 * Endereço público do CRM, com a mesma regra em todo lugar.
 *
 * Existe porque endereço recalculado em cada tela divergiu antes: o parceiro
 * guarda a URL do lado DELE (webhook do Contact2Sale, `redirect_uri` da Meta), e
 * a tela mostrava o que ela ACHAVA que estava lá.
 *
 * `localhost` é recusado de propósito. Em ambiente local a variável aponta para a
 * máquina do desenvolvedor: registrar isso num parceiro cria uma integração que
 * parece ligada e nunca recebe nada — e o sintoma aparece dias depois como "o lead
 * não chegou". Melhor recusar na hora.
 */
export function basePublica(origemDaRequisicao: string): { base: string; local: boolean } {
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim()
  const limpo = env.endsWith('/') ? env.slice(0, -1) : env
  const candidato = limpo && !limpo.includes('localhost') && !limpo.includes('127.0.0.1')
    ? limpo
    : origemDaRequisicao
  const local = candidato.includes('localhost') || candidato.includes('127.0.0.1')
  return { base: candidato, local }
}
