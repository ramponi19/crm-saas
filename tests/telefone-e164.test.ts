/**
 * lib/telefone-e164.ts tem de dar o MESMO resultado que core_telefone_e164 no
 * banco: os pares abaixo saíram de `select t, core_telefone_e164(t)` (03/11/2026).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { telefoneE164 } from '@/lib/telefone-e164'

const DO_BANCO: [string, string | null][] = [
  ['(19) 99888-7766', '+5519998887766'],
  ['19998887766', '+5519998887766'],
  ['1998887766', '+5519998887766'],
  ['5519998887766', '+5519998887766'],
  ['551998887766', '+5519998887766'],
  ['+55 19 99888-7766', '+5519998887766'],
  ['019998887766', '+5519998887766'],
  ['447710173736', '+447710173736'],
  ['+1 415 555 2671', '+5514155552671'],
  ['12345', null],
  ['', null],
  ['0', null],
  ['1133334444', '+551133334444'],
  ['11 3333-4444', '+551133334444'],
  ['5511933334444', '+5511933334444'],
  ['123456789012345', '+123456789012345'],
  ['1234567890123456', null],
  ['  55 (11) 9 1234-5678 ', '+5511912345678'],
]

test('igual a core_telefone_e164 do banco', () => {
  for (const [entrada, esperado] of DO_BANCO) assert.equal(telefoneE164(entrada), esperado, entrada)
  assert.equal(telefoneE164(null), null)
})
