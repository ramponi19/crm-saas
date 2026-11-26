/**
 * 5a — LOJAS QUE ENXERGA (migrações 20261126001000/0010; npm run test:local). JM de teste: lojas 3 (matriz) e 6;
 * vendedor M1 na loja 3. A rota /api/equipe/lojas grava pela função usuario_lojas_salvar na sessão de quem salva.
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
const { PATCH: salvarLojas } = await import('@/app/api/equipe/lojas/route')
const { POST: selecionarLoja } = await import('@/app/api/filial/selecionar/route')

before(async () => {
  for (const [quem, email] of Object.entries({ dono: 'dono.jm@teste.invalid', m1: 'vendedor.matriz1@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    s[quem] = c
  }
})

after(async () => {
  await svc.from('usuarios').update({ filial_atual_id: null } as never).eq('id', M1)
  await svc.from('empresa_usuario_lojas' as never).delete().eq('usuario_id', M1).neq('filial_id', 3)
  await svc.from('empresa_usuarios').update({ filial_id: 3 } as never).eq('usuario_id', M1).eq('empresa_id', EMPRESA)
  await svc.from('tarefas').delete().eq('empresa_id', EMPRESA).like('titulo', 'Lojas enxerga %')
})

const pedido = (metodo: string, corpo: unknown) => new Request('http://local/api', { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
const contarVisiveis = async (c: SupabaseClient) => {
  const { data } = await c.rpc('filiais_visiveis')
  return (data as number[]).map(Number).sort()
}

describe('lojas que enxerga', () => {
  test('o vendedor não muda as próprias lojas (rota 403) nem grava a lista direto (sem permissão)', async () => {
    atual = s.m1
    const r = await salvarLojas(pedido('PATCH', { id: M1, lojas: [3, 6], principal: 3 }) as never)
    assert.equal(r.status, 403)
    const direto = await s.m1.from('empresa_usuario_lojas' as never).insert({ empresa_id: EMPRESA, usuario_id: M1, filial_id: 6 } as never)
    assert.match(direto.error?.message ?? 'passou', /permission denied/)
    assert.deepEqual(await contarVisiveis(s.m1), [3])
  })

  test('o dono dá as duas lojas: o vendedor vê as duas, escolhe no topo e grava na escolhida', async () => {
    atual = s.dono
    const r = await salvarLojas(pedido('PATCH', { id: M1, lojas: [3, 6], principal: 3 }) as never)
    assert.equal(r.status, 200)
    assert.deepEqual(await contarVisiveis(s.m1), [3, 6])

    atual = s.m1
    const sel = await selecionarLoja(pedido('POST', { filialId: 6 }) as never)
    assert.equal(sel.status, 200)
    assert.deepEqual(await contarVisiveis(s.m1), [6])
    const t = await s.m1.from('tarefas').insert({ empresa_id: EMPRESA, titulo: 'Lojas enxerga topo 6' } as never).select('filial_id').single()
    assert.equal(t.error, null, t.error?.message)
    assert.equal((t.data as { filial_id: number }).filial_id, 6)

    const todas = await selecionarLoja(pedido('POST', { filialId: null }) as never)
    assert.equal(todas.status, 200)
    const t2 = await s.m1.from('tarefas').insert({ empresa_id: EMPRESA, titulo: 'Lojas enxerga todas' } as never).select('filial_id').single()
    assert.equal((t2.data as { filial_id: number }).filial_id, 3, 'em "Todas as minhas lojas" grava na principal')
  })

  test('a mudança vai para a Auditoria; tirar a lista volta à loja principal', async () => {
    const { data: ev } = await svc.from('auditoria_eventos').select('acao, antes, depois, usuario_id')
      .eq('entidade', 'usuario_lojas').eq('entidade_id', M1).order('id', { ascending: false }).limit(1).single()
    assert.deepEqual((ev as { depois: unknown }).depois, { lojas: [3, 6], principal: 3 })
    atual = s.dono
    const r = await salvarLojas(pedido('PATCH', { id: M1, lojas: [], principal: 3 }) as never)
    assert.equal(r.status, 200)
    assert.deepEqual(await contarVisiveis(s.m1), [3])
    atual = s.m1
    const sel = await selecionarLoja(pedido('POST', { filialId: 6 }) as never)
    assert.equal(sel.status, 403)
  })
})
