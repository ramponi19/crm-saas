/**
 * Atribuição manual fica fora da devolução automática à esteira (24/11/2026, regra universal).
 * 'atribuir'/'transferir' (dono, administrador, script com motivo) não volta sozinha; 'pegar' e 'distribuir'
 * (roleta) seguem com o prazo normal (o marco de cobrança não muda).
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { marcoDeCobranca, posseManual } from '@/lib/esteira'

const MILENA = 'u-milena', PEDRO = 'u-pedro'

describe('posse manual (fora da devolução)', () => {
  test('atribuir e transferir para o responsável atual: fora', () => {
    assert.equal(posseManual(MILENA, { acao: 'atribuir', para: MILENA }), true)
    assert.equal(posseManual(MILENA, { acao: 'transferir', para: MILENA }), true)
  })
  test('pegar e distribuir (roleta): prazo normal', () => {
    assert.equal(posseManual(MILENA, { acao: 'pegar', para: MILENA }), false)
    assert.equal(posseManual(MILENA, { acao: 'distribuir', para: MILENA }), false)
  })
  test('a marca é de outra pessoa (o dono mudou por outro caminho): prazo normal', () => {
    assert.equal(posseManual(PEDRO, { acao: 'atribuir', para: MILENA }), false)
  })
  test('sem marca (atribuição antiga sem histórico manual) ou sem responsável: prazo normal', () => {
    assert.equal(posseManual(MILENA, null), false)
    assert.equal(posseManual(null, { acao: 'atribuir', para: MILENA }), false)
  })
})

describe('o prazo continua contando do maior entre a mensagem do cliente e a atribuição', () => {
  test('lead antigo atribuído agora: prazo cheio a partir da atribuição', () => {
    const marco = marcoDeCobranca({ responsavel_desde: '2026-11-24T12:52:00Z', created_at: '2026-10-01T10:00:00Z' },
      { recebida: '2026-10-21T13:49:00Z', enviada: '2026-10-21T13:48:00Z' })
    assert.equal(marco, '2026-11-24T12:52:00Z')
  })
  test('cliente escreveu depois da atribuição: conta da mensagem', () => {
    const marco = marcoDeCobranca({ responsavel_desde: '2026-11-24T12:00:00Z', created_at: null },
      { recebida: '2026-11-24T13:00:00Z', enviada: '2026-11-24T11:00:00Z' })
    assert.equal(marco, '2026-11-24T13:00:00Z')
  })
})
