/**
 * VENDA FECHADA CONTRA O BANCO LOCAL DE VERDADE (npm run test:local; scripts/teste-local.sh).
 *
 * As rotas reais (/api/leads/mover e /api/leads/corrigir-data) rodam com uma SESSÃO REAL de um usuário de
 * teste no Supabase local descartável: a gravação passa por RLS, gatilhos e RPCs de verdade. Foi esse o
 * buraco de 23/11 — o teste com banco simulado aceitou `dados.venda`, e o gatilho core_validar_dados a
 * recusava em produção. Este arquivo existe para isso não se repetir.
 *
 * Só roda com TESTE_LOCAL_URL apontando para 127.0.0.1 (o script passa). Dados: a semente fictícia.
 */
import { test, describe, mock, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE

const SENHA = 'teste-local-123'
const USUARIOS = {
  dono: 'dono.demo@teste.invalid', admin: 'admin.demo@teste.invalid', vendedor: 'vendedor.demo@teste.invalid',
} as const
const EMPRESA = 5, LOJA = 1, FUNIL = 10, NOVO = 73, CONVERTIDO = 76
const MACBOOK = 10 // estoque_categorias da empresa 5 na semente

const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const sessoes: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', {
  namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA },
})
const { POST: mover } = await import('@/app/api/leads/mover/route')
const { POST: corrigir } = await import('@/app/api/leads/corrigir-data/route')

const chamar = async (rota: (r: Request) => Promise<Response>, corpo: unknown) => {
  const r = await rota(new Request('http://local/api', { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }))
  return { status: r.status, corpo: await r.json().catch(() => null) as Record<string, unknown> | null }
}
const como = (quem: keyof typeof USUARIOS) => { atual = sessoes[quem] }
async function negocioAberto(nome: string): Promise<number> {
  const { data: c, error: e1 } = await svc.from('contatos').insert({ empresa_id: EMPRESA, filial_id: LOJA, nome }).select('id').single()
  if (e1) throw e1
  const { data: n, error: e2 } = await svc.from('negocios').insert({
    empresa_id: EMPRESA, filial_id: LOJA, contato_id: c.id, funil_id: FUNIL, etapa_id: NOVO, status: 'aberto', valor_estimado: 4590,
    dados: { _lead: { ativo: true } },
  }).select('id').single()
  if (e2) throw e2
  return n.id as number
}
const ler = async (id: number) => (await svc.from('negocios').select('status, etapa_id, ganho_em, valor_estimado, dados').eq('id', id).single()).data!
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const venda = { data: hoje, categoria_id: MACBOOK, condicao: 'novo', valor: '4.590,00' }

before(async () => {
  for (const [quem, email] of Object.entries(USUARIOS)) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: SENHA })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    sessoes[quem] = c
  }
})

describe('marcar venda grava de verdade (rota + gatilhos do banco)', () => {
  test('sem os dados da venda: 422 e nada muda no banco', async () => {
    const id = await negocioAberto('Teste local sem venda'); como('vendedor')
    const r = await chamar(mover, { leadId: id, kanban_status: 'convertido' })
    assert.equal(r.status, 422); assert.equal(r.corpo?.codigo, 'GANHO_DADOS')
    assert.equal((await ler(id)).status, 'aberto')
  })
  test('com os dados: 200, ganho com dados.venda gravado (o gatilho aceita a chave de sistema)', async () => {
    const id = await negocioAberto('Teste local com venda'); como('vendedor')
    const r = await chamar(mover, { leadId: id, kanban_status: 'convertido', venda })
    assert.equal(r.status, 200, JSON.stringify(r.corpo))
    const n = await ler(id)
    assert.equal(n.status, 'ganho'); assert.equal(n.etapa_id, CONVERTIDO)
    const v = (n.dados as { venda: Record<string, unknown> }).venda
    assert.equal(v.categoria_id, MACBOOK); assert.equal(v.condicao, 'novo'); assert.equal(v.valor, 4590); assert.equal(v.data, hoje)
  })
  test('categoria de outra empresa (JM de teste): 422', async () => {
    const id = await negocioAberto('Teste local categoria alheia'); como('vendedor')
    const r = await chamar(mover, { leadId: id, kanban_status: 'convertido', venda: { ...venda, categoria_id: 1 } })
    assert.equal(r.status, 422); assert.equal(r.corpo?.campo, 'categoria_id')
  })
})

describe('reabrir e corrigir a data: só dono e admin', () => {
  let id: number
  before(async () => {
    id = await negocioAberto('Teste local reabrir'); como('dono')
    assert.equal((await chamar(mover, { leadId: id, kanban_status: 'convertido', venda })).status, 200)
  })
  test('vendedor: sem motivo 409; com motivo 403; continua ganho', async () => {
    como('vendedor')
    assert.equal((await chamar(mover, { leadId: id, kanban_status: 'negociando' })).status, 409)
    const r = await chamar(mover, { leadId: id, kanban_status: 'negociando', motivo_reabertura: 'vendedor tentando' })
    assert.equal(r.status, 403); assert.equal(r.corpo?.codigo, 'GANHO_SEM_PERMISSAO')
    assert.equal((await ler(id)).status, 'ganho')
  })
  test('vendedor não corrige a data (403); admin corrige com aviso e histórico', async () => {
    como('vendedor')
    assert.equal((await chamar(corrigir, { leadId: id, data: '2026-01-10', motivo: 'vendedor tentando' })).status, 403)
    como('admin')
    const r = await chamar(corrigir, { leadId: id, data: '2026-01-10', motivo: 'teste local: venda foi antes' })
    assert.equal(r.status, 200, JSON.stringify(r.corpo))
    assert.match(String((await ler(id)).ganho_em), /^2026-01-10/)
    const { data: h } = await svc.from('negocio_historico').select('acao').eq('negocio_id', id).eq('acao', 'data_venda_corrigida')
    assert.equal(h?.length, 1)
  })
  test('admin reabre com motivo: aberto, sem ganho_em, histórico reaberto_manual', async () => {
    como('admin')
    const r = await chamar(mover, { leadId: id, kanban_status: 'negociando', motivo_reabertura: 'teste local: cliente desistiu' })
    assert.equal(r.status, 200, JSON.stringify(r.corpo))
    const n = await ler(id)
    assert.equal(n.status, 'aberto'); assert.equal(n.ganho_em, null)
    const { data: h } = await svc.from('negocio_historico').select('acao').eq('negocio_id', id).eq('acao', 'reaberto_manual')
    assert.equal(h?.length, 1)
  })
})

describe('o banco confere a forma de dados.venda (core_validar_dados)', () => {
  test('condição fora de novo/seminovo é recusada pelo gatilho', async () => {
    const id = await negocioAberto('Teste local forma da venda')
    const { error } = await svc.from('negocios').update({ dados: { _lead: { ativo: true }, venda: { condicao: 'usado' } } }).eq('id', id)
    assert.match(String(error?.message), /negocio\.venda/)
  })
  test('chave desconhecida em dados continua recusada', async () => {
    const id = await negocioAberto('Teste local chave desconhecida')
    const { error } = await svc.from('negocios').update({ dados: { _lead: { ativo: true }, qualquer_coisa: 1 } }).eq('id', id)
    assert.match(String(error?.message), /campo personalizado desconhecido/)
  })
})
