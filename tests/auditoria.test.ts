import test from 'node:test'
import assert from 'node:assert/strict'
import { diferencas, lerFiltroAuditoria, rotuloAcao, rotuloEntidade } from '@/lib/auditoria'

// Etapa 1.1a (25/11/2026): regras puras da tela de Auditoria.

test('antes → depois: só os campos que mudaram, em ordem', () => {
  assert.deepEqual(diferencas({ valor: 1 }, { valor: 2 }), [{ campo: 'valor', antes: '1', depois: '2' }])
  assert.deepEqual(diferencas({ a: 1, b: 'x' }, { a: 1, b: 'y', c: true }), [
    { campo: 'b', antes: 'x', depois: 'y' }, { campo: 'c', antes: '—', depois: 'true' },
  ])
  assert.deepEqual(diferencas({ valor: null }, { valor: { semana: { 1: [] } } }), [{ campo: 'valor', antes: '—', depois: '{"semana":{"1":[]}}' }])
  assert.deepEqual(diferencas(null, null), [])
  assert.deepEqual(diferencas('a', 'b'), [{ campo: 'valor', antes: 'a', depois: 'b' }])
  assert.deepEqual(diferencas({ a: 1 }, { a: 1 }), [])
})

test('filtro da URL: só valores bem-formados passam; página fica entre 1 e 1000', () => {
  const f = lerFiltroAuditoria({
    pessoa: 'a632db2c-c42b-4973-8008-2d5ca2dbf479', entidade: 'config', acao: 'alterar', de: '2026-11-01', ate: '2026-11-25', plataforma: '1', pagina: '3',
  })
  assert.deepEqual(f, { pessoa: 'a632db2c-c42b-4973-8008-2d5ca2dbf479', entidade: 'config', acao: 'alterar', de: '2026-11-01', ate: '2026-11-25', plataforma: true, pagina: 3 })
  const ruim = lerFiltroAuditoria({ pessoa: "x' or 1=1", entidade: 'Config;drop', acao: ['a', 'b'], de: '01/11/2026', pagina: '-2' })
  assert.deepEqual(ruim, { pessoa: null, entidade: null, acao: null, de: null, ate: null, plataforma: false, pagina: 1 })
  assert.equal(lerFiltroAuditoria({ pagina: '5000' }).pagina, 1)
})

test('rótulos conhecidos e desconhecidos', () => {
  assert.equal(rotuloEntidade('config'), 'Configuração')
  assert.equal(rotuloAcao('plataforma_entrou'), 'Entrou (plataforma)')
  assert.equal(rotuloEntidade('nova_coisa'), 'nova_coisa')
})
