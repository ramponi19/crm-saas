/**
 * CPF e CNPJ pelos dígitos verificadores — um lugar só.
 *
 * Nasceu na máscara do ZapIntel (separar CPF de celular com DDD numa conversa) e
 * passou a valer também no cadastro do cliente (lib/clientes.ts, 05/11/2026): até
 * então quem gravava o `cpf_validado` era o gatilho da view `clientes`, sempre com
 * `false`, e documento digitado errado entrava no contrato.
 */

export const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const dv = (base: string, peso: number) => {
    let soma = 0
    for (const c of base) soma += Number(c) * peso--
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10])
}

export function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13])
}

export type Documento =
  | { ok: true; cpf: boolean; cnpj: boolean }
  | { ok: false; erro: string }

/**
 * O documento do cadastro: vazio passa (nem todo cliente dá CPF no balcão);
 * 11 dígitos têm de ser CPF válido, 14 têm de ser CNPJ válido, o resto é recusado.
 */
export function conferirDocumento(bruto: string | null | undefined): Documento {
  const d = soDigitos(bruto)
  if (!d) return { ok: true, cpf: false, cnpj: false }
  if (d.length === 11) return cpfValido(d) ? { ok: true, cpf: true, cnpj: false } : { ok: false, erro: 'CPF inválido: confira os dígitos' }
  if (d.length === 14) return cnpjValido(d) ? { ok: true, cpf: false, cnpj: true } : { ok: false, erro: 'CNPJ inválido: confira os dígitos' }
  return { ok: false, erro: 'CPF/CNPJ incompleto: o CPF tem 11 dígitos e o CNPJ, 14' }
}
