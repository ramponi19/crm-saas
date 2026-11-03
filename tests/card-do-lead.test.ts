/**
 * Campos personalizados do card: o texto do formulário vira o tipo que o banco
 * valida em core_validar_dados (03/11/2026). Valor que não converte é recusado
 * antes de gravar (a rota responde 400), em vez de virar erro do banco.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valorDoCampo } from '@/lib/card-do-lead'

test('número e moeda aceitam vírgula decimal e milhar com ponto', () => {
  assert.equal(valorDoCampo('numero', '42'), 42)
  assert.equal(valorDoCampo('moeda', '1.234,56'), 1234.56)
  assert.equal(valorDoCampo('numero', 'abc'), undefined)
})

test('booleano só aceita true/false do select', () => {
  assert.equal(valorDoCampo('booleano', 'true'), true)
  assert.equal(valorDoCampo('booleano', 'false'), false)
  assert.equal(valorDoCampo('booleano', 'sim'), undefined)
})

test('múltipla escolha vira lista; texto, data e opção ficam texto', () => {
  assert.deepEqual(valorDoCampo('multi', 'a, b ,, c'), ['a', 'b', 'c'])
  assert.equal(valorDoCampo('texto', 'Testador'), 'Testador')
  assert.equal(valorDoCampo('data', '1990-05-17'), '1990-05-17')
  assert.equal(valorDoCampo('opcao', 'Solteiro'), 'Solteiro')
})
