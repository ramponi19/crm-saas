/**
 * Quem usa o ZapIntel (decisão do Lucas, 15/10/2026): dono, admin e superadmin.
 * Vendedor e técnico, não — nem digitando /zapintel.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeUsarZapintel } from '@/lib/zapintel/quem-usa'

test('dono e admin entram', () => {
  assert.equal(podeUsarZapintel('owner', false), true)
  assert.equal(podeUsarZapintel('admin', false), true)
})

test('vendedor, técnico, membro e sem vínculo ficam de fora', () => {
  for (const papel of ['vendedor', 'tecnico', 'member', '', null, undefined]) {
    assert.equal(podeUsarZapintel(papel, false), false, String(papel))
  }
})

test('superadmin entra mesmo sem vínculo com a empresa (prévia, impersonação)', () => {
  assert.equal(podeUsarZapintel(null, true), true)
  assert.equal(podeUsarZapintel('vendedor', true), true)
})
