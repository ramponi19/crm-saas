/**
 * CONFIGURAÇÕES › PÓS-VENDA CONTRA O BANCO LOCAL (npm run test:local; scripts/teste-local.sh). C7 bloco 3.
 * JM de teste da semente (empresa 1): Administrador A grava; o vendedor M1 é recusado pela RLS. A rota real
 * /api/pos-venda/config; o modelo de Marketing só entra no passo depois que a empresa libera a categoria.
 */
import { test, describe, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE

const EMPRESA = 1
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const sessoes: Record<string, SupabaseClient> = {}
let atual: SupabaseClient
mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => atual, getEmpresaId: async () => EMPRESA } })
const { POST } = await import('@/app/api/pos-venda/config/route')

const enviar = async (corpo: unknown) => {
  const r = await POST(new Request('http://local/api', { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }))
  return { status: r.status, corpo: await r.json() as Record<string, unknown> }
}
const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T }
let utilidade = 0, marketing = 0, regua = 0

before(async () => {
  for (const [quem, email] of Object.entries({ m1: 'vendedor.matriz1@teste.invalid', admin: 'admin.a@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    sessoes[quem] = c
  }
  ok(await svc.from('empresa_modulos').upsert({ empresa_id: EMPRESA, modulo: 'posvenda', ativo: true }, { onConflict: 'empresa_id,modulo' }).select('modulo'))
  await svc.from('configuracoes_sistema').delete().eq('empresa_id', EMPRESA).eq('chave', 'posvenda.categorias_modelo')
  const ms = ok(await svc.from('modelos_mensagem').insert([
    { empresa_id: EMPRESA, nome: 'pv_teste_utilidade', idioma: 'pt_BR', categoria: 'UTILITY', corpo: 'Oi {{1}}, chegou bem?', status: 'aprovado' },
    { empresa_id: EMPRESA, nome: 'pv_teste_marketing', idioma: 'pt_BR', categoria: 'MARKETING', corpo: 'Oi {{1}}, temos novidades', status: 'aprovado' },
  ]).select('id, categoria')) as { id: number; categoria: string }[]
  utilidade = ms.find((m) => m.categoria === 'UTILITY')!.id
  marketing = ms.find((m) => m.categoria === 'MARKETING')!.id
})
after(async () => {
  await svc.from('empresa_modulos').update({ ativo: false }).eq('empresa_id', EMPRESA).eq('modulo', 'posvenda').select('modulo')
})

describe('Configurações › Pós-venda (rota + RLS + config_salvar)', () => {
  test('vendedor não cria régua (403); administrador cria', async () => {
    atual = sessoes.m1
    assert.equal((await enviar({ acao: 'regua', nome: 'Régua do vendedor' })).status, 403)
    atual = sessoes.admin
    const r = await enviar({ acao: 'regua', nome: 'Régua de teste da config', prioridade: 50, categorias: [1], condicao: 'seminovo' })
    assert.equal(r.status, 200)
    regua = r.corpo.id as number
    const { data } = await svc.from('posvenda_cadencias').select('filtros, prioridade').eq('id', regua).single()
    assert.deepEqual(data, { filtros: { categorias: [1], condicao: 'seminovo' }, prioridade: 50 })
  })

  test('passo com modelo de Utilidade entra; de Marketing só depois que a empresa libera', async () => {
    atual = sessoes.admin
    assert.equal((await enviar({ acao: 'passo', cadencia_id: regua, ordem: 1, dia_offset: 7, tipo_acao: 'pesquisa', titulo: 'Experiência', modelo_id: utilidade })).status, 200)
    const mk = await enviar({ acao: 'passo', cadencia_id: regua, ordem: 2, dia_offset: 30, tipo_acao: 'whatsapp', titulo: 'Acessórios', modelo_id: marketing })
    assert.equal(mk.status, 422); assert.match(String(mk.corpo.error), /Utilidade/)
    assert.equal((await enviar({ acao: 'parametro', chave: 'categorias_modelo', valor: ['UTILITY', 'MARKETING'] })).status, 200)
    assert.equal((await enviar({ acao: 'passo', cadencia_id: regua, ordem: 2, dia_offset: 30, tipo_acao: 'whatsapp', titulo: 'Acessórios', modelo_id: marketing })).status, 200)
    assert.equal((await enviar({ acao: 'passo', cadencia_id: regua, ordem: 2, dia_offset: 31, tipo_acao: 'whatsapp', titulo: 'Repetido' })).status, 409)
  })

  test('parâmetros: valor fora do limite recusado; por loja só onde vale; responsável padrão tem de ser pessoa da equipe', async () => {
    atual = sessoes.admin
    assert.equal((await enviar({ acao: 'parametro', chave: 'teto_diario', valor: 0 })).status, 422)
    assert.equal((await enviar({ acao: 'parametro', chave: 'teto_diario', valor: 20, filialId: 3 })).status, 200)
    assert.equal((await enviar({ acao: 'parametro', chave: 'nps_limite_chamado', valor: 5, filialId: 3 })).status, 400)
    assert.equal((await enviar({ acao: 'parametro', chave: 'responsavel_padrao', valor: '00000000-0000-4000-8000-000000000999', filialId: 3 })).status, 422)
    assert.equal((await enviar({ acao: 'parametro', chave: 'responsavel_padrao', valor: '0e5e0000-0000-4000-8000-000000000101', filialId: 3 })).status, 200)
    const { data } = await svc.from('configuracoes_sistema').select('valor').eq('empresa_id', EMPRESA).eq('chave', 'posvenda.teto_diario').single()
    assert.equal((data!.valor as { lojas: Record<string, number> }).lojas['3'], 20)
    atual = sessoes.m1
    assert.equal((await enviar({ acao: 'parametro', chave: 'sla_horas', valor: 'corridas' })).status, 403)
  })

  test('chamados: prazo por prioridade e categoria nova; nada apagado (desligar = ativo false)', async () => {
    atual = sessoes.admin
    assert.equal((await enviar({ acao: 'sla', prioridade: 'normal', primeira_resposta_horas: 12, resolucao_horas: 48 })).status, 200)
    assert.equal((await enviar({ acao: 'sla', prioridade: 'normal', primeira_resposta_horas: 50, resolucao_horas: 48 })).status, 422)
    const c = await enviar({ acao: 'categoria_chamado', nome: 'Película' })
    assert.equal(c.status, 200)
    assert.equal((await enviar({ acao: 'categoria_chamado', id: c.corpo.id, nome: 'Película', ativo: false })).status, 200)
    const { data } = await svc.from('posvenda_chamado_categorias').select('ativo').eq('id', c.corpo.id as number).single()
    assert.equal(data!.ativo, false)
  })
})
