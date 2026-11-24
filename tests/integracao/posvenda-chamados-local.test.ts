/**
 * CHAMADOS E NOTA MANUAL CONTRA O BANCO LOCAL (npm run test:local; scripts/teste-local.sh). C7 bloco 4.
 * JM de teste (empresa 1, loja 3): vendedores M1 e M2, Administrador A. Rotas reais /api/pos-venda/chamados e
 * /api/pos-venda/nps; as RPCs da 1700/1800 decidem.
 */
import { test, describe, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE

const EMPRESA = 1, LOJA = 3
const M1 = '0e5e0000-0000-4000-8000-000000000101'
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const sessoes: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA } })
const chamados = await import('@/app/api/pos-venda/chamados/route')
const nps = await import('@/app/api/pos-venda/nps/route')

const post = async (h: (r: Request) => Promise<Response>, corpo: unknown) => {
  const r = await h(new Request('http://local/api', { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }))
  return { status: r.status, corpo: await r.json() as Record<string, unknown> }
}
const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T }
let contato = 0, negocio = 0, chamado = 0

before(async () => {
  for (const [quem, email] of Object.entries({ m1: 'vendedor.matriz1@teste.invalid', m2: 'vendedor.matriz2@teste.invalid', admin: 'admin.a@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    sessoes[quem] = c
  }
  ok(await svc.from('empresa_modulos').upsert({ empresa_id: EMPRESA, modulo: 'posvenda', ativo: true }, { onConflict: 'empresa_id,modulo' }).select('modulo'))
  contato = (ok(await svc.from('contatos').insert({ empresa_id: EMPRESA, filial_id: LOJA, nome: 'Cliente Chamado' }).select('id').single()) as { id: number }).id
  negocio = (ok(await svc.from('negocios').insert({ empresa_id: EMPRESA, filial_id: LOJA, contato_id: contato, funil_id: 1, etapa_id: 18, status: 'aberto',
    responsavel_id: M1, dados: { _lead: { ativo: true } } }).select('id').single()) as { id: number }).id
})
after(async () => {
  await svc.from('empresa_modulos').update({ ativo: false }).eq('empresa_id', EMPRESA).eq('modulo', 'posvenda').select('modulo')
})

describe('chamados e nota manual (rotas + RPCs + banco)', () => {
  test('o vendedor abre o chamado do cliente dele; vai para os administradores', async () => {
    atual = sessoes.m1
    const r = await post(chamados.POST, { acao: 'abrir', contato_id: contato, negocio_id: negocio, titulo: 'Tela piscando', prioridade: 'alta', descricao: 'desde ontem' })
    assert.equal(r.status, 200)
    chamado = (r.corpo.chamado as { id: number }).id
    assert.notEqual((r.corpo.chamado as { responsavel_id: string }).responsavel_id, M1)
    assert.equal((await post(chamados.POST, { acao: 'abrir', contato_id: contato, titulo: '  ' })).status, 422)
  })

  test('quem não é o responsável não mexe (403); o administrador anda, anota e resolve; o histórico conta tudo', async () => {
    atual = sessoes.m1
    assert.equal((await post(chamados.POST, { acao: 'mover', chamado_id: chamado, texto: 'olhando' })).status, 403)
    atual = sessoes.admin
    const { data: st } = await svc.from('posvenda_chamado_status').select('id, tipo').eq('empresa_id', EMPRESA)
    const id = (t: string) => (st as { id: number; tipo: string }[]).find((s) => s.tipo === t)!.id
    assert.equal((await post(chamados.POST, { acao: 'mover', chamado_id: chamado, status_id: id('andamento'), texto: 'liguei' })).status, 200)
    assert.equal((await post(chamados.POST, { acao: 'mover', chamado_id: chamado, status_id: id('resolvido') })).status, 200)
    const g = await chamados.GET(new Request(`http://local/api?id=${chamado}`))
    const eventos = ((await g.json()) as { eventos: { tipo: string; para: string | null; texto: string | null; por: string | null }[] }).eventos
    assert.deepEqual(eventos.map((e) => `${e.tipo}:${e.para}`), ['status:Aberto', 'status:Em andamento', 'status:Resolvido'])
    assert.equal(eventos[1].texto, 'liguei')
    assert.equal(eventos[1].por, 'Administrador A')
  })

  test('nota manual: outro vendedor não registra (403); o responsável registra; nota baixa abre chamado', async () => {
    atual = sessoes.m2
    assert.equal((await post(nps.POST, { negocio_id: negocio, nota: 9 })).status, 403)
    atual = sessoes.m1
    assert.equal((await post(nps.POST, { negocio_id: negocio, nota: 11 })).status, 422)
    const r = await post(nps.POST, { negocio_id: negocio, nota: 3, comentario: 'demorou' })
    assert.equal(r.status, 200)
    assert.ok((r.corpo.resultado as { chamado_id: number | null }).chamado_id)
  })

  test('módulo desligado: 403 nas duas rotas', async () => {
    ok(await svc.from('empresa_modulos').update({ ativo: false }).eq('empresa_id', EMPRESA).eq('modulo', 'posvenda').select('modulo'))
    atual = sessoes.admin
    assert.equal((await post(chamados.POST, { acao: 'mover', chamado_id: chamado, texto: 'x' })).status, 403)
    assert.equal((await post(nps.POST, { negocio_id: negocio, nota: 9 })).status, 403)
  })
})
