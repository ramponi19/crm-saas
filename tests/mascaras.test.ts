/** Máscaras e validação do cadastro (lib/mascaras.ts, 17/11/2026). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erroCnpj, erroTelefone, mascaraCnpj, mascaraTelefone } from '@/lib/mascaras'

test('CNPJ: máscara enquanto digita e validação pelos dígitos verificadores', () => {
  assert.equal(mascaraCnpj('11222333000181'), '11.222.333/0001-81')
  assert.equal(mascaraCnpj('11.222'), '11.222')
  assert.equal(mascaraCnpj('112223330001819999'), '11.222.333/0001-81')
  assert.equal(erroCnpj(''), null)
  assert.equal(erroCnpj('11.222.333/0001-81'), null)
  assert.match(erroCnpj('11.222.333/0001-80') ?? '', /CNPJ inválido/)
  assert.match(erroCnpj('11111111111111') ?? '', /CNPJ inválido/)
})

test('telefone: máscara com DDD e validação', () => {
  assert.equal(mascaraTelefone('11999998888'), '(11) 99999-8888')
  assert.equal(mascaraTelefone('1133334444'), '(11) 3333-4444')
  assert.equal(mascaraTelefone('119'), '(11) 9')
  assert.equal(erroTelefone(''), null)
  assert.equal(erroTelefone('(11) 99999-8888'), null)
  assert.match(erroTelefone('9999-8888') ?? '', /Telefone inválido/)
})
