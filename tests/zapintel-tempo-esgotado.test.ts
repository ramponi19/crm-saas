/**
 * Tempo esgotado do ZapIntel vira evento (lib/zapintel/tempo-esgotado.ts): só o 57014 grava,
 * com função, empresa, loja e duração; sem empresa não grava; falha ao gravar não derruba a tela.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bancoFalso } from './banco-falso'
import { registrarTempoEsgotado, ehTempoEsgotado, TIPO_TEMPO_ESGOTADO } from '@/lib/zapintel/tempo-esgotado'

const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' }

test('57014 grava em eventos: função, empresa, loja, dias, duração e tentativa', async () => {
  const db = bancoFalso(() => ({ data: null, error: null }))
  const ok = await registrarTempoEsgotado(db as never, TIMEOUT, {
    funcao: 'zapintel_insights', empresa: 1, inicio: 1_000, params: { p_dias: 30, p_filial: 3, p_empresa: 1 }, tentativa: 1,
  }, 9_352)
  assert.equal(ok, true)
  assert.equal(db.consultas.length, 1)
  const c = db.consultas[0]
  assert.equal(c.tabela, 'eventos')
  assert.equal(c.op, 'insert')
  assert.deepEqual(c.dados, {
    empresa_id: 1, tipo: TIPO_TEMPO_ESGOTADO, entidade: 'rpc',
    dados: { funcao: 'zapintel_insights', duracao_ms: 8352, filial: 3, dias: 30, tentativa: 1 },
  })
})

test('rede (sem loja) e sem dias gravam null; tentativa padrão 0', async () => {
  const db = bancoFalso(() => ({ data: null, error: null }))
  await registrarTempoEsgotado(db as never, TIMEOUT, { funcao: 'zapintel_dashboard', empresa: 2, inicio: 0, params: { p_filial: null } }, 8100)
  assert.deepEqual((db.consultas[0].dados as { dados: unknown }).dados, { funcao: 'zapintel_dashboard', duracao_ms: 8100, filial: null, dias: null, tentativa: 0 })
})

test('outros erros, sucesso e empresa ainda não carregada não gravam', async () => {
  const db = bancoFalso(() => ({ data: null, error: null }))
  assert.equal(await registrarTempoEsgotado(db as never, null, { funcao: 'f', empresa: 1, inicio: 0 }), false)
  assert.equal(await registrarTempoEsgotado(db as never, { code: '42501', message: 'permission denied' }, { funcao: 'f', empresa: 1, inicio: 0 }), false)
  assert.equal(await registrarTempoEsgotado(db as never, TIMEOUT, { funcao: 'f', empresa: null, inicio: 0 }), false)
  assert.equal(db.consultas.length, 0)
})

test('reconhece o tempo esgotado também só pela mensagem', () => {
  assert.equal(ehTempoEsgotado({ message: 'canceling statement due to statement timeout' }), true)
  assert.equal(ehTempoEsgotado({ code: '57014' }), true)
  assert.equal(ehTempoEsgotado({ code: 'PGRST301', message: 'JWT expired' }), false)
})

test('falha ao gravar (RLS ou rede) não lança', async () => {
  const recusa = bancoFalso(() => ({ data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }))
  assert.equal(await registrarTempoEsgotado(recusa as never, TIMEOUT, { funcao: 'f', empresa: 1, inicio: 0 }), false)
  const quebra = { from() { throw new Error('rede') } }
  assert.equal(await registrarTempoEsgotado(quebra as never, TIMEOUT, { funcao: 'f', empresa: 1, inicio: 0 }), false)
})
