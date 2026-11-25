/**
 * ROTINAS: A ROTA /api/cron/[job] REGISTRA A EXECUÇÃO (entrega 1.1r; npm run test:local; scripts/teste-local.sh).
 * A rota de verdade contra o banco local: job que dá certo fica 'ok'; job que estoura fica 'falhou' com a
 * mensagem; sem o segredo (401) e job desconhecido (404) não abrem execução. A resposta da rota não muda.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE
process.env.CRON_SECRET = 'segredo-so-do-teste-local'

const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const { GET } = await import('@/app/api/cron/[job]/route')

const chamar = (job: string, segredo = 'segredo-so-do-teste-local') =>
  GET(new NextRequest(`http://local/api/cron/${job}`, { headers: { authorization: `Bearer ${segredo}` } }),
    { params: Promise.resolve({ job }) })

const ultima = async (rotina: string) => {
  const { data, error } = await svc.from('rotinas_execucoes').select('id, status, origem, erro, fim, resumo')
    .eq('rotina', rotina).order('id', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as { id: number; status: string; origem: string; erro: string | null; fim: string | null; resumo: unknown } | null
}
const total = async () => (await svc.from('rotinas_execucoes').select('id', { count: 'exact', head: true })).count ?? 0

describe('a rota /api/cron/[job] registra a execução', () => {
  test('job que dá certo: 200 igual a antes e execução ok, fechada, com a resposta no resumo', async () => {
    const r = await chamar('expirar-trials')
    assert.equal(r.status, 200)
    const corpo = await r.json() as { ok: boolean; job: string }
    assert.equal(corpo.ok, true)
    const e = await ultima('expirar-trials')
    assert.ok(e, 'sem execução registrada')
    assert.equal(e!.status, 'ok')
    assert.equal(e!.origem, 'http')
    assert.ok(e!.fim)
    assert.equal((e!.resumo as { job?: string })?.job, 'expirar-trials')
  })

  test('job que estoura: 500 com a mensagem e execução falhou com o erro', async () => {
    // No ritual o Storage não sobe (scripts/teste-local.sh -x storage-api): listar o bucket da LGPD estoura,
    // sem mexer em rotina nenhuma. É a falha real e conhecida que este teste usa.
    const antes = await total()
    const r = await chamar('lgpd-limpar')
    assert.equal(r.status, 500)
    const corpo = await r.json() as { error: string; job: string }
    assert.equal(corpo.job, 'lgpd-limpar')
    const e = await ultima('lgpd-exportacoes-limpar')
    assert.equal(await total(), antes + 1)
    assert.equal(e!.status, 'falhou')
    assert.equal(e!.erro, corpo.error)
  })

  test('sem o segredo (401) e job desconhecido (404): nada registrado', async () => {
    const antes = await total()
    assert.equal((await chamar('expirar-trials', 'errado')).status, 401)
    assert.equal((await chamar('nao-existe')).status, 404)
    assert.equal(await total(), antes)
  })
})
