import test from 'node:test'
import assert from 'node:assert/strict'
import { barradoPorSemOfertas } from '@/lib/sem-ofertas'

// 24/11/2026: "não quero receber ofertas" só barra modelo de Marketing (Transmissão, Automatize, pós-venda).
test('sem ofertas: barra Marketing; Utilidade passa; sem a marca, tudo passa', () => {
  assert.equal(barradoPorSemOfertas('MARKETING', '2026-11-24T15:00:00Z'), true)
  assert.equal(barradoPorSemOfertas('marketing', '2026-11-24T15:00:00Z'), true)
  assert.equal(barradoPorSemOfertas('UTILITY', '2026-11-24T15:00:00Z'), false)
  assert.equal(barradoPorSemOfertas('MARKETING', null), false)
  assert.equal(barradoPorSemOfertas(null, '2026-11-24T15:00:00Z'), false)
})
