/**
 * ESCRITA DA PLATAFORMA PELAS ROTAS COM CHAVE DE SERVIÇO (etapa 1.1c; npm run test:local; migração 20261126000100).
 *
 * Rotas DE VERDADE (createServiceClient real, PostgREST local real): só os cookies da requisição e a sessão são
 * simulados. Superadmin local (…0901) dentro da JM de teste (empresa 1) grava por três rotas que usam a chave de
 * serviço; cada escrita vira linha "plataforma" na Auditoria, sem valores. A mesma rota com o Administrador A não
 * gera linha; sem o cookie de impersonação o app nem pergunta; e o cabeçalho mandado por um navegador é ignorado.
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
const SUPER = '0e5e0000-0000-4000-8000-000000000901'
const ADMIN_A = '0e5e0000-0000-4000-8000-000000000201'
const M1 = '0e5e0000-0000-4000-8000-000000000101'
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })

let sessao: SupabaseClient
let loja: { getAll(): { name: string; value: string }[] } = { getAll: () => [] }
const COOKIES_PLATAFORMA = [{ name: 'sb-local-auth-token', value: 'x' }, { name: 'impersonating_empresa_id', value: String(EMPRESA) }]

mock.module('next/headers', { namedExports: { cookies: async () => loja, headers: async () => new Headers() } })
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => sessao, getEmpresaId: async () => EMPRESA } })
const { PATCH: roleta } = await import('@/app/api/equipe/roleta/route')
const { POST: fuso } = await import('@/app/api/empresa/fuso/route')
const { PATCH: empresa } = await import('@/app/api/empresa/route')

const s: Record<string, SupabaseClient> = {}
async function entrar(email: string) {
  const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}
function como(quem: 'super' | 'admin', cookies = COOKIES_PLATAFORMA) {
  sessao = s[quem]
  loja = { getAll: () => cookies }   // objeto novo = requisição nova (memória por requisição)
}
const json = (corpo: unknown, metodo = 'PATCH') => new Request('http://localhost/api', {
  method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
}) as never

async function maiorId(): Promise<number> {
  const { data } = await svc.from('auditoria_eventos').select('id').order('id', { ascending: false }).limit(1)
  return (data?.[0] as { id: number } | undefined)?.id ?? 0
}
async function linhasDesde(id: number) {
  const { data } = await svc.from('auditoria_eventos').select('empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, antes, depois, origem')
    .gt('id', id).like('acao', 'plataforma\\_%').not('acao', 'in', '(plataforma_entrou,plataforma_acessou,plataforma_saiu)').order('id')
  return (data ?? []) as { empresa_id: number; usuario_id: string; impersonado_por: string; entidade_id: string; acao: string; antes: unknown; depois: { campos?: string[] } | null; origem: string }[]
}

let nomeOriginal = ''
before(async () => {
  s.super = await entrar('superadmin.local@teste.invalid')
  s.admin = await entrar('admin.a@teste.invalid')
  const { error } = await s.super.rpc('set_impersonation', { p_empresa_id: EMPRESA, p_ttl_seconds: 600 })
  if (error) throw new Error(`set_impersonation: ${error.message}`)
  const { data } = await svc.from('empresas').select('nome').eq('id', EMPRESA).single()
  nomeOriginal = (data as { nome: string }).nome
})
after(async () => {
  await s.super?.rpc('encerrar_impersonacao')
  await svc.from('empresa_usuarios').update({ participa_roleta: true }).eq('empresa_id', EMPRESA).eq('usuario_id', M1)
  await svc.from('empresas').update({ nome: nomeOriginal }).eq('id', EMPRESA)
  await svc.from('configuracoes_sistema').delete().eq('empresa_id', EMPRESA).eq('chave', 'fuso')
})

describe('rotas com chave de serviço gravam a escrita da plataforma na Auditoria', () => {
  test('/api/equipe/roleta (empresa_usuarios): superadmin dentro da empresa → linha sem valores', async () => {
    como('super')
    const desde = await maiorId()
    const r = await roleta(json({ id: M1, participaRoleta: false }))
    assert.equal(r.status, 200, await r.clone().text())
    const linhas = await linhasDesde(desde)
    assert.equal(linhas.length, 1)
    const l = linhas[0]
    assert.equal(l.acao, 'plataforma_update')
    assert.match(l.entidade_id, /^empresa_usuarios:\d+$/)
    assert.deepEqual(l.depois, { campos: ['participa_roleta'] })
    assert.equal(l.antes, null)
    assert.equal(l.origem, 'gatilho servico')
    assert.equal(l.impersonado_por, SUPER)
    assert.equal(l.empresa_id, EMPRESA)
  })

  test('/api/empresa/fuso (configuracoes_sistema, upsert e delete): duas linhas', async () => {
    const desde = await maiorId()
    como('super')
    let r = await fuso(json({ fuso: 'America/Manaus' }, 'POST'))
    if (r.status === 403) {
      // a rota exige papel owner/admin pelo contexto da sessão; o superadmin precisa passar nela como passa na tela
      assert.fail(`superadmin recebeu 403 em /api/empresa/fuso: ${await r.text()}`)
    }
    assert.equal(r.status, 200, await r.clone().text())
    como('super')
    r = await fuso(json({ fuso: 'America/Sao_Paulo' }, 'POST'))
    assert.equal(r.status, 200)
    const linhas = await linhasDesde(desde)
    assert.deepEqual(linhas.map((l) => `${l.entidade_id.split(':')[0]}:${l.acao}`), ['configuracoes_sistema:plataforma_insert', 'configuracoes_sistema:plataforma_delete'])
    assert.ok(linhas.every((l) => l.origem === 'gatilho servico' && l.impersonado_por === SUPER))
  })

  test('/api/empresa (empresas, gatilho novo): linha com a empresa impersonada', async () => {
    como('super')
    const desde = await maiorId()
    const r = await empresa(json({ nome: `${nomeOriginal} (teste plataforma)` }))
    assert.equal(r.status, 200, await r.clone().text())
    const linhas = await linhasDesde(desde)
    assert.equal(linhas.length, 1)
    assert.equal(linhas[0].entidade_id, `empresas:${EMPRESA}`)
    // o banco atualiza updated_at junto: a linha diz quais campos mudaram, sem os valores
    assert.ok(linhas[0].depois?.campos?.includes('nome'), JSON.stringify(linhas[0].depois))
    assert.equal(JSON.stringify(linhas[0].depois).includes('teste plataforma'), false)
    assert.equal(linhas[0].empresa_id, EMPRESA)
  })

  test('mesma rota pelo Administrador A (equipe): nenhuma linha, mesmo com o cookie de impersonação forjado', async () => {
    como('admin')
    const desde = await maiorId()
    const r = await roleta(json({ id: M1, participaRoleta: true }))
    assert.equal(r.status, 200, await r.clone().text())
    assert.equal((await linhasDesde(desde)).length, 0)
  })

  test('superadmin sem o cookie de impersonação: o app não pergunta, nenhuma linha (limite conhecido)', async () => {
    como('super', [{ name: 'sb-local-auth-token', value: 'x' }])
    const desde = await maiorId()
    const r = await roleta(json({ id: M1, participaRoleta: false }))
    assert.equal(r.status, 200)
    assert.equal((await linhasDesde(desde)).length, 0)
  })

  test('cabeçalho mandado por um navegador (chave anon + sessão) é ignorado', async () => {
    const navegador = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, {
      auth: { persistSession: false }, global: { headers: { 'x-nexus-usuario': SUPER } },
    })
    await navegador.auth.signInWithPassword({ email: 'admin.a@teste.invalid', password: 'teste-local-123' })
    const desde = await maiorId()
    const { error } = await navegador.from('empresa_usuarios').update({ participa_roleta: true }).eq('empresa_id', EMPRESA).eq('usuario_id', M1)
    assert.equal(error, null)
    assert.equal((await linhasDesde(desde)).length, 0)
    assert.ok(ADMIN_A)
  })
})
