/**
 * Garantia conta da ENTREGA (correção de 25/11/2026, depois do hotfix H1 de 24/11).
 * Desde o hotfix, a encomenda guarda o lançamento em data_venda e a entrega em concluida_em. A garantia na
 * Assistência, o termo de garantia e a 2ª via do Histórico usam lib/data-entrega.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { dataDeEntrega, diasDeGarantiaRestantes, maisRecentePorEntrega } from '@/lib/data-entrega'

// Encomenda lançada em 20/10 e entregue em 18/11 (meses diferentes).
const ENCOMENDA = { data_venda: '2026-10-20T15:00:00.000Z', concluida_em: '2026-11-18T17:30:00.000Z', created_at: '2026-10-20T15:00:01.000Z' }

describe('dataDeEntrega', () => {
  test('encomenda lançada num mês e entregue em outro: vale a entrega', () => {
    assert.equal(dataDeEntrega(ENCOMENDA), '2026-11-18T17:30:00.000Z')
  })
  test('venda anterior ao hotfix (sem concluida_em): vale data_venda, que já era a da entrega', () => {
    assert.equal(dataDeEntrega({ data_venda: '2026-09-02T12:00:00.000Z', concluida_em: null }), '2026-09-02T12:00:00.000Z')
  })
  test('sem nenhuma das duas: created_at; sem nada: null', () => {
    assert.equal(dataDeEntrega({ data_venda: null, concluida_em: null, created_at: '2026-08-01T10:00:00.000Z' }), '2026-08-01T10:00:00.000Z')
    assert.equal(dataDeEntrega({}), null)
    assert.equal(dataDeEntrega(null), null)
  })
})

describe('diasDeGarantiaRestantes (Assistência)', () => {
  // 18h UTC: dias inteiros desde a entrega (17h30) e desde o lançamento (15h)
  const hoje = new Date('2026-12-01T18:00:00.000Z')
  test('90 dias contados da entrega, não do lançamento', () => {
    const daEntrega = diasDeGarantiaRestantes(new Date(dataDeEntrega(ENCOMENDA)!), 90, hoje)
    const doLancamento = diasDeGarantiaRestantes(new Date(ENCOMENDA.data_venda), 90, hoje)
    assert.equal(daEntrega, 77)     // 13 dias desde 18/11
    assert.equal(doLancamento, 48)  // o erro que a correção evita: 29 dias a menos
  })
  test('vencida fica negativa', () => {
    assert.equal(diasDeGarantiaRestantes(new Date('2026-08-01T12:00:00.000Z'), 90, hoje), -32)
  })
})

describe('maisRecentePorEntrega (mesmo IMEI vendido mais de uma vez)', () => {
  test('escolhe a entregue por último, mesmo lançada antes', () => {
    const revendida = { data_venda: '2026-11-01T12:00:00.000Z', concluida_em: null }
    // lançada antes da revenda, mas entregue depois dela
    assert.equal(maisRecentePorEntrega([revendida, ENCOMENDA]), ENCOMENDA)
  })
  test('lista vazia: null', () => {
    assert.equal(maisRecentePorEntrega([]), null)
    assert.equal(maisRecentePorEntrega(null), null)
  })
})
