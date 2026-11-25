/**
 * CARGOS E PERMISSÕES COM SESSÃO REAL (etapa 1.1b; npm run test:local; scripts/teste-local.sh).
 * JM de teste (empresa 1): dono, administrador A, vendedor M1 e M2. O banco decide: cargo_salvar só com
 * equipe.cargos; a Consulta não grava nem pela API direta; o contexto da sessão traz cargo e permissões; a
 * exportação recusa quem não tem core.exportar.
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
const M2 = '0e5e0000-0000-4000-8000-000000000102'
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const s: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA } })
const { GET: exportar } = await import('@/app/api/exportar/route')

let cargoVendedor = 0, cargoConsulta = 0
before(async () => {
  for (const [quem, email] of Object.entries({ dono: 'dono.jm@teste.invalid', admin: 'admin.a@teste.invalid', m1: 'vendedor.matriz1@teste.invalid', m2: 'vendedor.matriz2@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    s[quem] = c
  }
  const { data } = await svc.from('empresa_cargos').select('id, nome').eq('empresa_id', EMPRESA)
  const cargos = (data ?? []) as { id: number; nome: string }[]
  cargoVendedor = cargos.find((c) => c.nome === 'Vendedor')!.id
  cargoConsulta = cargos.find((c) => c.nome === 'Consulta')!.id
  const { error } = await svc.from('empresa_usuarios').update({ cargo_id: cargoConsulta }).eq('empresa_id', EMPRESA).eq('usuario_id', M2)
  if (error) throw error
})
after(async () => {
  await svc.from('empresa_usuarios').update({ cargo_id: cargoVendedor, participa_roleta: true }).eq('empresa_id', EMPRESA).eq('usuario_id', M2)
  await svc.from('empresa_cargos').delete().eq('empresa_id', EMPRESA).eq('nome', 'Gerente do teste local')
})

describe('cargos e permissões com sessão real', () => {
  test('contexto da sessão: o vendedor tem cargo Vendedor, sem custo; a Consulta é só leitura', async () => {
    const { data: m1 } = await s.m1.rpc('sessao_contexto')
    assert.equal(m1.empresa_id, EMPRESA)
    assert.equal(m1.cargo.nome, 'Vendedor')
    assert.equal(m1.somente_leitura, false)
    assert.ok(!m1.permissoes.includes('estoque.ver_custo'))
    const { data: m2 } = await s.m2.rpc('sessao_contexto')
    assert.equal(m2.cargo.nome, 'Consulta')
    assert.equal(m2.somente_leitura, true)
  })

  test('cargo_salvar: o dono cria; o administrador e o vendedor são recusados pelo banco', async () => {
    const dono = await s.dono.rpc('cargo_salvar', { p_id: null, p_nome: 'Gerente do teste local', p_descricao: null, p_permissoes: ['core.ver_relatorios'], p_somente_leitura: false })
    assert.equal(dono.error, null)
    const adm = await s.admin.rpc('cargo_salvar', { p_id: null, p_nome: 'Do admin', p_descricao: null, p_permissoes: [], p_somente_leitura: false })
    assert.match(adm.error?.message ?? '', /SEM_PERMISSAO/)
    const vend = await s.m1.rpc('usuario_cargo_trocar', { p_usuario: M2, p_cargo: cargoVendedor })
    assert.match(vend.error?.message ?? '', /SEM_PERMISSAO/)
  })

  test('a Consulta não grava nem pela API direta (o banco recusa)', async () => {
    const upd = await s.m2.from('contatos').update({ observacoes: 'consulta tentou' }).eq('empresa_id', EMPRESA).select('id')
    assert.equal((upd.data ?? []).length, 0)
    const ins = await s.m2.from('etiquetas').insert({ empresa_id: EMPRESA, nome: 'consulta grava?' }).select('id')
    assert.ok(ins.error, 'a inserção da Consulta deveria ser recusada')
    const tarefa = await s.m2.rpc('config_salvar', { p_modulo: 'core', p_chave: 'teste_consulta', p_valor: 1 })
    assert.match(tarefa.error?.message ?? '', /SOMENTE_LEITURA/)
  })

  test('exportar: vendedor sem core.exportar recebe 403; administrador passa da permissão', async () => {
    atual = s.m1
    const r1 = await exportar(new Request('http://local/api/exportar?tipo=leads') as never)
    assert.equal(r1.status, 403)
    atual = s.admin
    const r2 = await exportar(new Request('http://local/api/exportar?tipo=leads') as never)
    assert.notEqual(r2.status, 403)
  })
})
