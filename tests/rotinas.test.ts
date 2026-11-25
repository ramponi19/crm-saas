import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ROTINA_DO_JOB, empresasDaResposta, erroDaResposta, statusDaResposta, totalDeAvisos } from '@/lib/rotinas'

// Entrega 1.1r (25/11/2026): status da execução a partir da resposta de /api/cron/[job].

test('status: 5xx e 4xx falham; ok:false, falhas, erros ou sub-resultado com erro = com_erro; o resto ok', () => {
  assert.equal(statusDaResposta(500, { error: 'boom', job: 'automacoes' }), 'falhou')
  assert.equal(statusDaResposta(401, { error: 'Não autorizado' }), 'falhou')
  assert.equal(statusDaResposta(200, { ok: true, job: 'lgpd-limpar', removidos: 2 }), 'ok')
  assert.equal(statusDaResposta(200, { ok: false, job: 'ponte-vendas', falhas: [] }), 'com_erro')
  assert.equal(statusDaResposta(200, { ok: true, job: 'renovar-tokens', falhas: [{ canal: 3, erro: 'x' }] }), 'com_erro')
  assert.equal(statusDaResposta(200, { ok: true, job: 'automacoes', publicos: { erro: 'tabela sumiu' }, transmissoes: { enviadas: 1 } }), 'com_erro')
  assert.equal(statusDaResposta(200, { ok: true, erros: [] }), 'ok')
  assert.equal(statusDaResposta(200, null), 'ok')
})

test('empresas: erro por empresa das listas falhas/erros; resultado por empresa entra como ok', () => {
  const corpo = {
    ok: false, job: 'ponte-vendas',
    resultado: [{ empresa: 1, vendas: 10, gravadas: 3 }, { empresa: 5, vendas: 0, gravadas: 0 }],
    falhas: [{ empresa: 5, erro: 'timeout' }, { canal: 9, erro: 'sem empresa' }],
  }
  assert.deepEqual(empresasDaResposta(corpo), [
    { empresa: 1, status: 'ok', contagens: { empresa: 1, vendas: 10, gravadas: 3 } },
    { empresa: 5, status: 'erro', erro: 'timeout' },
  ])
  assert.deepEqual(empresasDaResposta({ ok: true }), [])
  assert.deepEqual(empresasDaResposta('texto'), [])
})

test('mensagem de erro: a do 500, quantas empresas, ou o sub-resultado', () => {
  assert.equal(erroDaResposta(500, { error: 'Erro no cron' }, []), 'Erro no cron')
  assert.equal(erroDaResposta(200, { ok: false }, [{ empresa: 5, status: 'erro', erro: 'x' }]), '1 empresa(s) com erro')
  assert.equal(erroDaResposta(200, { ok: false, publicos: { erro: 'tabela sumiu' } }, []), 'publicos: tabela sumiu')
  assert.equal(erroDaResposta(200, { ok: true }, []), null)
})

test('todo job agendado (pg_cron e vercel.json) tem rotina; o catálogo da migração tem todas', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string }[] }
  for (const c of vercel.crons) {
    const job = c.path.replace('/api/cron/', '')
    assert.ok(ROTINA_DO_JOB[job], `job da Vercel sem rotina: ${job}`)
  }
  const migracao = readFileSync('supabase/migrations/20261125000600_rotinas_execucoes.sql', 'utf8')
  for (const r of Object.values(ROTINA_DO_JOB).filter((n) => n !== 'sync-fipe')) {
    assert.ok(migracao.includes(`('${r}',`), `rotina fora do catálogo: ${r}`)
  }
})

test('avisos: erros não vistos + atrasadas', () => {
  assert.equal(totalDeAvisos(null), 0)
  assert.equal(totalDeAvisos({ problemas: [], atrasadas: 0 }), 0)
  assert.equal(totalDeAvisos({ problemas: [{ id: 1 } as never, { id: 2 } as never], atrasadas: 1 }), 3)
})
