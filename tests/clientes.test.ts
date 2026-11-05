import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conferirDocumento } from '@/lib/documento'
import { iniciais } from '@/lib/sem-nome'
import { clienteDoContato, entradaDoCorpo } from '@/lib/clientes'

test('documento: vazio passa, CPF e CNPJ pelos dígitos verificadores', () => {
  assert.deepEqual(conferirDocumento(null), { ok: true, cpf: false, cnpj: false })
  assert.deepEqual(conferirDocumento('529.982.247-25'), { ok: true, cpf: true, cnpj: false })
  assert.deepEqual(conferirDocumento('11.222.333/0001-81'), { ok: true, cpf: false, cnpj: true })
  assert.equal(conferirDocumento('529.982.247-24').ok, false)
  assert.equal(conferirDocumento('111.111.111-11').ok, false)
  assert.equal(conferirDocumento('123.456').ok, false)
})

test('iniciais: por ponto de código, nunca meio emoji (React #418 de /clientes)', () => {
  assert.equal(iniciais('🌸 Ana Souza'), 'AS')
  assert.equal(iniciais('João da Silva'), 'JS')
  assert.equal(iniciais('Ana'), 'AN')
  assert.equal(iniciais('💜'), 'CL')
  assert.equal(iniciais(null), 'CL')
  for (const nome of ['🌸 Ana', '💜💜', 'A 🔥 B']) assert.equal(iniciais(nome).isWellFormed(), true)
})

test('cliente do contato: colunas, endereço, campos e marca', () => {
  const c = clienteDoContato({
    id: 7, empresa_id: 1, filial_id: 3, nome: 'Ana', email: null, telefone: '19 99999-0000', cpf_cnpj: '529.982.247-25',
    instagram: null, observacoes: null, ativo: true, created_at: '2026-11-05T10:00:00+00:00',
    endereco: { logradouro: 'Rua A', numero: '1', cidade: 'Mogi Guaçu', estado: 'SP' },
    dados: {
      data_nascimento: '1990-05-17', profissao: 'Comerciante', tipo_cliente: 'VIP', origem_cliente: 'Indicação',
      valor_pretendido: 450000, proprietario: true, corretor_id: 'u1',
      _cliente: { cpf_validado: true, lead_id: 42 },
    },
  })
  assert.equal(c.endereco, 'Rua A')
  assert.equal(c.cidade, 'Mogi Guaçu')
  assert.equal(c.bairro, null)
  assert.equal(c.data_nascimento, '1990-05-17')
  assert.equal(c.tipo_cliente, 'VIP')
  assert.equal(c.cpf_validado, true)
  assert.equal(c.cnpj_validado, false)
  assert.equal(c.lead_id, 42)
  assert.equal(c.valor_pretendido, 450000)
  assert.equal(c.proprietario, true)
  assert.equal(c.status_aprovacao, 'pendente') // o padrão da antiga coluna da view
})

test('entrada: só as chaves do cliente passam', () => {
  assert.deepEqual(entradaDoCorpo({ nome: 'Ana', empresa_id: 99, id: 5, dados: {}, ativo: false }), { nome: 'Ana', ativo: false })
  assert.deepEqual(entradaDoCorpo(null), {})
})
