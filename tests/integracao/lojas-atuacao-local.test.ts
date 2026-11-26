/**
 * SÓ GRAVA EM LOJA EM QUE PODE ATUAR (correção de segurança de 26/11/2026; migrações 20261126000900/0910;
 * npm run test:local). JM de teste: lojas 3 (matriz) e 6; vendedor M1 na loja 3; dono em todas.
 * Tentativa DIRETA pela API (PostgREST, sessão real) e pela rota com chave de serviço (/api/clientes).
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
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const s: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA } })
const { POST: criarClienteRota } = await import('@/app/api/clientes/route')
const { POST: selecionarLoja } = await import('@/app/api/filial/selecionar/route')
const criados: number[] = []

before(async () => {
  for (const [quem, email] of Object.entries({ dono: 'dono.jm@teste.invalid', m1: 'vendedor.matriz1@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    s[quem] = c
  }
})

after(async () => {
  if (criados.length) await svc.from('contatos').delete().in('id', criados)
  await svc.from('tarefas').delete().eq('empresa_id', EMPRESA).like('titulo', 'Lojas atuação %')
  await svc.from('usuarios').update({ filial_atual_id: null } as never).eq('id', M1)
})

const pedido = (corpo: unknown) => new Request('http://local/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })

describe('vendedor da loja 3', () => {
  test('API direta: contato e tarefa em outra loja são recusados; na loja dele passam', async () => {
    const c = await s.m1.from('contatos').insert({ empresa_id: EMPRESA, filial_id: 6, nome: 'Lojas atuação contato', telefone: '5519911110001' } as never).select('id')
    assert.match(c.error?.message ?? 'passou', /LOJA_SEM_ATUACAO/)
    const t6 = await s.m1.from('tarefas').insert({ empresa_id: EMPRESA, filial_id: 6, titulo: 'Lojas atuação 6' } as never).select('id')
    assert.match(t6.error?.message ?? 'passou', /LOJA_SEM_ATUACAO/)
    const t3 = await s.m1.from('tarefas').insert({ empresa_id: EMPRESA, filial_id: 3, titulo: 'Lojas atuação 3' } as never).select('id')
    assert.equal(t3.error, null, t3.error?.message)
  })

  test('API direta: não troca a própria loja do topo para outra loja', async () => {
    // o navegador não tem UPDATE em usuarios (só a rota grava); se um dia ganhar, o gatilho da 0910 barra
    const r = await s.m1.from('usuarios').update({ filial_atual_id: 6 } as never).eq('id', M1).select('id')
    assert.match(r.error?.message ?? 'passou', /LOJA_SEM_ATUACAO|permission denied/)
    const { data } = await svc.from('usuarios').select('filial_atual_id').eq('id', M1).single()
    assert.equal((data as { filial_atual_id: number | null }).filial_atual_id, null)
    // pela chave de serviço (o caminho da rota), o gatilho barra mesmo assim
    const viaServico = await svc.from('usuarios').update({ filial_atual_id: 6 } as never).eq('id', M1).select('id')
    assert.match(viaServico.error?.message ?? 'passou', /LOJA_SEM_ATUACAO/)
  })

  test('rota /api/clientes (chave de serviço): loja de outra pessoa → 403; a dele → grava nela', async () => {
    atual = s.m1
    const r6 = await criarClienteRota(pedido({ nome: 'Lojas atuação rota 6', telefone: '19911110002', filial_id: 6 }) as never)
    assert.equal(r6.status, 403)
    const r3 = await criarClienteRota(pedido({ nome: 'Lojas atuação rota 3', telefone: '19911110003', filial_id: 3 }) as never)
    assert.equal(r3.status, 200)
    const id = ((await r3.json()) as { cliente: { id: number } }).cliente.id
    criados.push(id)
    const { data } = await svc.from('contatos').select('filial_id').eq('id', id).single()
    assert.equal((data as { filial_id: number }).filial_id, 3)
  })

  test('rota /api/filial/selecionar: sem "ver a rede" é recusada', async () => {
    atual = s.m1
    const r = await selecionarLoja(pedido({ filialId: 6 }) as never)
    assert.equal(r.status, 403)
  })
})

describe('dono (vê a rede)', () => {
  test('grava em qualquer loja e escolhe qualquer loja no topo', async () => {
    atual = s.dono
    const r = await criarClienteRota(pedido({ nome: 'Lojas atuação dono 6', telefone: '19911110004', filial_id: 6 }) as never)
    assert.equal(r.status, 200)
    criados.push(((await r.json()) as { cliente: { id: number } }).cliente.id)
    const sel = await selecionarLoja(pedido({ filialId: 6 }) as never)
    assert.equal(sel.status, 200)
    await selecionarLoja(pedido({ filialId: null }) as never)
  })
})
