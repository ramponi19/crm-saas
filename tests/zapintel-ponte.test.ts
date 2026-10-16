/**
 * A ponte venda↔conversa nunca sobrescreve uma ligação confirmada à mão.
 *
 * O defeito (16/10/2026): `gravarPonte` lia as ligações `manual` e ignorava o
 * erro da leitura. Com a leitura falhando, a lista vinha vazia, ninguém era
 * protegido e o upsert gravava o palpite por telefone por cima das confirmadas.
 * Os testes separam os três casos que o código precisa separar — erro, lista
 * vazia de verdade, lista com confirmadas — e o corte de 1000 linhas do PostgREST.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bancoFalso, filtro, type Consulta } from './banco-falso'
import type { LinhaPonte } from '@/lib/zapintel/ponte'

// O Sentry de mentira precisa estar no lugar ANTES de a ponte ser importada.
const capturar = mock.fn((_erro: unknown, _contexto?: unknown) => 'id-falso')
mock.module('@sentry/nextjs', { namedExports: { captureException: capturar } })
const { gravarPonte } = await import('@/lib/zapintel/ponte')
beforeEach(() => capturar.mock.resetCalls())

type Captura = { tags: Record<string, string>; contexts: { ponte: Record<string, number> } }

const como = (db: unknown) => db as unknown as SupabaseClient

const linha = (venda_id: number): LinhaPonte => ({
  venda_id, empresa_id: 1, cliente_id: venda_id * 10, lead_id: venda_id * 100,
  como: 'telefone', confianca: 'alta', dias_ate_venda: 3,
})

const ehLeituraManual = (c: Consulta) =>
  c.tabela === 'zapintel_venda_lead' && c.op === 'select' && filtro(c, 'eq')?.[0] === 'empresa_id'

/** Os venda_id que chegaram ao upsert, somando todos os lotes. */
const gravados = (consultas: Consulta[]) =>
  consultas.filter((c) => c.op === 'upsert').flatMap((c) => (c.dados as LinhaPonte[]).map((l) => l.venda_id))

describe('ponte: ligação confirmada à mão nunca é sobrescrita', () => {
  test('erro ao ler as confirmadas: nada é gravado e o motivo vai para o log', async (t) => {
    const log = t.mock.method(console, 'error', () => {})
    const db = bancoFalso((c) => ehLeituraManual(c)
      ? { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }
      : { data: null, error: null })

    await assert.rejects(gravarPonte(como(db), [linha(1), linha(2)]), /ligacoes manuais nao lidas/)

    assert.equal(db.consultas.filter((c) => c.op === 'upsert').length, 0, 'não pode chegar ao upsert')
    assert.equal(log.mock.callCount(), 1)
    const registro = JSON.parse(String(log.mock.calls[0].arguments[0]))
    assert.deepEqual(
      { evento: registro.evento, motivo: registro.motivo, empresa_id: registro.empresa_id, linhas: registro.linhas },
      { evento: 'zapintel.ponte.gravacao_pulada', motivo: 'ligacoes_manuais_nao_lidas', empresa_id: 1, linhas: 2 },
    )
    assert.match(registro.erro, /statement timeout/)

    // E alguém é avisado: o cron engole o erro em 500, então o aviso sai daqui.
    assert.equal(capturar.mock.callCount(), 1)
    const [erro, ctx] = capturar.mock.calls[0].arguments as [Error, Captura]
    assert.match(erro.message, /ligacoes manuais nao lidas/)
    assert.deepEqual(ctx.tags, { modulo: 'zapintel', job: 'ponte', empresa_id: '1', motivo: 'ligacoes_manuais_nao_lidas' })
    assert.deepEqual(ctx.contexts.ponte, { linhas: 2 })
  })

  test('erro no upsert: avisa com quanto já tinha entrado antes da falha', async (t) => {
    const log = t.mock.method(console, 'error', () => {})
    let lotes = 0
    const db = bancoFalso((c) => {
      if (c.op !== 'upsert') return { data: [], error: null }
      lotes++
      return lotes === 2 ? { data: null, error: { message: 'connection reset' } } : { data: null, error: null }
    })
    const muitas = Array.from({ length: 700 }, (_, i) => linha(i + 1))

    await assert.rejects(gravarPonte(como(db), muitas), /gravada em parte/)

    assert.equal(log.mock.callCount(), 1)
    assert.equal(JSON.parse(String(log.mock.calls[0].arguments[0])).motivo, 'upsert_falhou')
    assert.equal(capturar.mock.callCount(), 1)
    const [, ctx] = capturar.mock.calls[0].arguments as [Error, Captura]
    assert.deepEqual(ctx.tags, { modulo: 'zapintel', job: 'ponte', empresa_id: '1', motivo: 'upsert_falhou' })
    assert.deepEqual(ctx.contexts.ponte, { linhas: 700, a_gravar: 700, gravadas_antes_da_falha: 500, lote: 200 })
  })

  test('lista vazia de verdade (nenhuma confirmada): grava tudo normalmente', async (t) => {
    const log = t.mock.method(console, 'error', () => {})
    const db = bancoFalso(() => ({ data: [], error: null }))

    const n = await gravarPonte(como(db), [linha(1), linha(2), linha(3)])

    assert.equal(n, 3)
    assert.deepEqual(gravados(db.consultas), [1, 2, 3])
    assert.equal(log.mock.callCount(), 0, 'lista vazia não é erro')
    assert.equal(capturar.mock.callCount(), 0, 'lista vazia não avisa ninguém')
    const leitura = db.consultas.find(ehLeituraManual)!
    assert.deepEqual(leitura.filtros.filter((f) => f[0] === 'eq'), [['eq', 'empresa_id', 1], ['eq', 'como', 'manual']])
  })

  test('com confirmadas: elas ficam fora do upsert e o resto grava', async () => {
    const db = bancoFalso((c) => ehLeituraManual(c)
      ? { data: [{ venda_id: 2 }, { venda_id: 4 }], error: null }
      : { data: null, error: null })

    const n = await gravarPonte(como(db), [linha(1), linha(2), linha(3), linha(4)])

    assert.equal(n, 2)
    assert.deepEqual(gravados(db.consultas), [1, 3])
    const upsert = db.consultas.find((c) => c.op === 'upsert')!
    assert.deepEqual(upsert.filtros, [], 'upsert sem filtro extra')
  })

  test('mais de 1000 confirmadas: a 1001ª também é protegida (o PostgREST corta em silêncio)', async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ venda_id: i + 1 }))
    const db = bancoFalso((c) => {
      if (!ehLeituraManual(c)) return { data: null, error: null }
      const [de] = (filtro(c, 'range') ?? [0]) as [number]
      return { data: de === 0 ? pagina1 : de === 1000 ? [{ venda_id: 1001 }] : [], error: null }
    })

    const n = await gravarPonte(como(db), [linha(1000), linha(1001), linha(1002)])

    assert.equal(n, 1)
    assert.deepEqual(gravados(db.consultas), [1002])
  })

  test('sem linhas não consulta o banco', async () => {
    const db = bancoFalso(() => ({ data: [], error: null }))
    assert.equal(await gravarPonte(como(db), []), 0)
    assert.equal(db.consultas.length, 0)
  })
})
