/**
 * Isolamento entre sessões (regra de 24/11/2026): tools/rebuild-local.sh só fecha o Docker e o WSL quando
 * tools/sessoes-locais.mjs não encontra pilha nem container de OUTRO projeto. A regra pura está em outrasPilhas.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { outrasPilhas } from '../tools/sessoes-locais.mjs'

const PROPRIO = 'guiuzbcqkvelqcuogxtd'

describe('outrasPilhas (rebuild-local.sh pode fechar o Docker?)', () => {
  test('registro vazio e Docker vazio: livre', () => {
    assert.deepEqual(outrasPilhas({ registro: { pilhas: [], containers: [] }, dockerNomes: [], projetoProprio: PROPRIO }), [])
  })

  test('sem arquivo de registro e sem Docker: livre', () => {
    assert.deepEqual(outrasPilhas({ registro: null, dockerNomes: [], projetoProprio: PROPRIO }), [])
  })

  test('só a própria pilha de pé no Docker: livre', () => {
    const nomes = ['supabase_db_guiuzbcqkvelqcuogxtd', 'supabase_kong_guiuzbcqkvelqcuogxtd', 'supabase_auth_guiuzbcqkvelqcuogxtd']
    assert.deepEqual(outrasPilhas({ registro: null, dockerNomes: nomes, projetoProprio: PROPRIO }), [])
  })

  test('pilha de outra sessão de pé (o incidente de 24/11): bloqueia', () => {
    const r = outrasPilhas({ registro: null, dockerNomes: ['supabase_db_hotfix-entregar', 'supabase_rest_hotfix-entregar'], projetoProprio: PROPRIO })
    assert.equal(r.length, 2)
    assert.ok(r.every((m: string) => m.includes('hotfix-entregar')))
  })

  test('pilha de outra sessão só registrada (contêineres parados): bloqueia', () => {
    const registro = { pilhas: [{ nome: 'posvenda-teste', project_id: 'posvenda-teste', sessao: 'abc' }], containers: [] }
    assert.deepEqual(outrasPilhas({ registro, dockerNomes: [], projetoProprio: PROPRIO }), ['pilha registrada: posvenda-teste (sessão abc)'])
  })

  test('a própria pilha registrada não bloqueia', () => {
    const registro = { pilhas: [{ nome: 'principal', project_id: PROPRIO }], containers: [] }
    assert.deepEqual(outrasPilhas({ registro, dockerNomes: [], projetoProprio: PROPRIO }), [])
  })

  test('container avulso (Postgres de diagnóstico) registrado ou de pé: bloqueia', () => {
    const registro = { pilhas: [], containers: [{ nome: 'diag-c1b5202f', sessao: 'c1b5202f' }] }
    assert.equal(outrasPilhas({ registro, dockerNomes: [], projetoProprio: PROPRIO }).length, 1)
    assert.deepEqual(outrasPilhas({ registro: null, dockerNomes: ['diag-preco'], projetoProprio: PROPRIO }), ['container de pé: diag-preco'])
  })

  test('o mesmo container registrado e de pé aparece uma vez por motivo, sem repetir linha', () => {
    const r = outrasPilhas({ registro: { pilhas: [{ project_id: 'x' }, { project_id: 'x' }] }, dockerNomes: [], projetoProprio: PROPRIO })
    assert.deepEqual(r, ['pilha registrada: x'])
  })
})
