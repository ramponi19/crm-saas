/**
 * Situação da empresa e faturamento estimado (18/11/2026): Piloto e Cortesia fora do MRR, sem vencimento.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faturamentoEstimado, situacaoDaEmpresa, type EmpresaFaturamento } from '@/lib/faturamento'

const agora = new Date('2026-11-18T12:00:00Z')
const preco = { base: 197 }
const e = (x: Partial<EmpresaFaturamento>): EmpresaFaturamento => ({ plano: 'base', status: 'ativo', trial_ends_at: null, ...x })

test('situação: demonstração, só leitura, piloto, cortesia, teste, pagante', () => {
  assert.equal(situacaoDaEmpresa(e({ demo: true, piloto: true }), agora), 'demonstracao')
  assert.equal(situacaoDaEmpresa(e({ status: 'suspenso' }), agora), 'suspensa')
  assert.equal(situacaoDaEmpresa(e({ piloto: true }), agora), 'piloto')
  assert.equal(situacaoDaEmpresa(e({ cortesia: true }), agora), 'cortesia')
  assert.equal(situacaoDaEmpresa(e({ trial_ends_at: '2026-11-30T00:00:00Z' }), agora), 'teste')
  assert.equal(situacaoDaEmpresa(e({ trial_ends_at: '2026-11-01T00:00:00Z' }), agora), 'pagante')
  assert.equal(situacaoDaEmpresa(e({}), agora), 'pagante')
})

test('MRR: só o pagante conta; piloto, cortesia, teste e demonstração ficam fora', () => {
  const lista = [e({}), e({ piloto: true }), e({ cortesia: true }), e({ trial_ends_at: '2026-11-30T00:00:00Z' }), e({ demo: true })]
  assert.equal(faturamentoEstimado(lista, agora, preco), 197)
})
