/**
 * 5b — DISTRIBUIÇÃO POR LOJA (migrações 20261126001100/0110; npm run test:local). JM de teste: lojas 3 (matriz) e 6.
 * A rota grava pelas funções do banco na sessão de quem salva; a roleta do app (lib/roleta) lê a mesma lista do banco.
 */
import { test, describe, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE

const EMPRESA = 1
const M1 = '0e5e0000-0000-4000-8000-000000000101'
const J2 = '0e5e0000-0000-4000-8000-000000000104'
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const s: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA } })
const { PATCH } = await import('@/app/api/distribuicao/por-loja/route')
const { membrosElegiveis } = await import('@/lib/roleta')
let roleta6Antes: string[] = []

before(async () => {
  for (const [quem, email] of Object.entries({ dono: 'dono.jm@teste.invalid', m1: 'vendedor.matriz1@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    s[quem] = c
  }
  const { data } = await svc.from('distribuicao_participantes' as never).select('usuario_id').eq('empresa_id', EMPRESA).eq('filial_id', 6).eq('lista', 'roleta')
  roleta6Antes = ((data ?? []) as { usuario_id: string }[]).map((r) => r.usuario_id)
})

after(async () => {
  atual = s.dono
  await PATCH(pedido({ acao: 'lista', filialId: 6, lista: 'roleta', usuarios: roleta6Antes }) as never)
})

const pedido = (corpo: unknown) => new Request('http://local/api', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })

describe('distribuição por loja', () => {
  test('o vendedor não muda a distribuição (403) nem grava a lista direto', async () => {
    atual = s.m1
    const r = await PATCH(pedido({ acao: 'lista', filialId: 3, lista: 'roleta', usuarios: [M1] }) as never)
    assert.equal(r.status, 403)
    const direto = await s.m1.from('distribuicao_participantes' as never).insert({ empresa_id: EMPRESA, filial_id: 3, lista: 'roleta', usuario_id: M1 } as never)
    assert.match(direto.error?.message ?? 'passou', /permission denied/)
  })

  test('quem não enxerga a loja não entra na lista (422)', async () => {
    atual = s.dono
    const r = await PATCH(pedido({ acao: 'lista', filialId: 6, lista: 'roleta', usuarios: [M1] }) as never)
    assert.equal(r.status, 422)
  })

  test('o dono tira todos da roleta da loja 6: a roleta do app fica vazia; devolve J2 e ele volta', async () => {
    atual = s.dono
    assert.equal((await PATCH(pedido({ acao: 'lista', filialId: 6, lista: 'roleta', usuarios: [] }) as never)).status, 200)
    assert.deepEqual((await membrosElegiveis(svc as never, EMPRESA, 6)).ids, [])
    assert.equal((await PATCH(pedido({ acao: 'lista', filialId: 6, lista: 'roleta', usuarios: [J2] }) as never)).status, 200)
    assert.deepEqual((await membrosElegiveis(svc as never, EMPRESA, 6)).ids, [J2])
    const { data: ev } = await svc.from('auditoria_eventos').select('depois').eq('entidade', 'distribuicao').eq('entidade_id', '6:roleta')
      .order('id', { ascending: false }).limit(1).single()
    assert.deepEqual((ev as { depois: { pessoas: string[] } }).depois.pessoas, [J2])
  })
})
