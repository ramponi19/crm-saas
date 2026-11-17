/**
 * MÁSCARAS DE DIGITAÇÃO (17/11/2026, cadastro "pronto para vender"): o que a pessoa digita vira o formato
 * brasileiro enquanto digita. A validação é outra coisa: CNPJ pelos dígitos verificadores
 * (lib/documento.ts → cnpjValido), telefone pelo E.164 (lib/telefone-e164.ts).
 */
import { cnpjValido, soDigitos } from '@/lib/documento'
import { telefoneE164 } from '@/lib/telefone-e164'

/** 00.000.000/0000-00 */
export function mascaraCnpj(v: string): string {
  const d = soDigitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** (11) 99999-9999 ou (11) 9999-9999 */
export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** CNPJ do cadastro: vazio passa; preenchido tem de ser válido. Devolve o erro ou null. */
export function erroCnpj(v: string | null | undefined): string | null {
  const d = soDigitos(v)
  if (!d) return null
  return cnpjValido(d) ? null : 'CNPJ inválido: confira os números.'
}

/** Telefone do cadastro: vazio passa; preenchido tem de ser um telefone com DDD. */
export function erroTelefone(v: string | null | undefined): string | null {
  const d = soDigitos(v)
  if (!d) return null
  return d.length >= 10 && d.length <= 11 && telefoneE164(d) ? null : 'Telefone inválido: use DDD + número.'
}
