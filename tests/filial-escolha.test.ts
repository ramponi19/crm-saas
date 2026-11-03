/**
 * POST /api/filial/selecionar com corpo mal formado é 400, não 500 (03/11/2026).
 * O 500 apareceu no Sentry quando chegou um corpo `null`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filialEscolhida } from '@/lib/filial-escolha'

test('loja escolhida e Rede passam', () => {
  assert.equal(filialEscolhida({ filialId: 3 }), 3)
  assert.equal(filialEscolhida({ filialId: null }), null)
})

test('corpo vazio, null ou sem a chave é pedido mal formado', () => {
  for (const corpo of [undefined, null, {}, [], 'x', 7]) assert.equal(filialEscolhida(corpo), undefined)
})

test('id que não é inteiro positivo é pedido mal formado', () => {
  for (const id of ['3', 0, -1, 2.5, NaN, true, {}]) assert.equal(filialEscolhida({ filialId: id }), undefined)
})
