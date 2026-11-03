/**
 * O MESMO telefone E.164 que o banco calcula em `core_telefone_e164` — a chave de
 * identidade do contato (índice único por empresa em contatos.telefone_e164).
 *
 * Existe aqui porque o card do lead passou a gravar em `contatos` direto
 * (03/11/2026), sem o gatilho da view `leads` que fazia a conta. As duas regras
 * mudam juntas: o teste tests/telefone-e164.test.ts tem os casos tirados do banco.
 *
 *   - tira tudo que não é dígito e os zeros à esquerda;
 *   - 55 + 10/11 dígitos: tira o 55 (nacional); 12 a 15 dígitos sem 55: internacional;
 *   - 10 dígitos de celular (3º dígito 6–9): ganha o 9;
 *   - 10/11 dígitos: +55; o resto não é telefone (null).
 */
export function telefoneE164(telefone: string | null | undefined): string | null {
  let d = (telefone ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  else if (d.length >= 12 && d.length <= 15) return '+' + d
  if (d.length === 10 && '6789'.includes(d[2])) d = d.slice(0, 2) + '9' + d.slice(2)
  if ((d.length === 10 || d.length === 11) && d[0] !== '0') return '+55' + d
  return null
}
