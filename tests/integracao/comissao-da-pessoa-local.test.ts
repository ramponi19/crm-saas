/**
 * COMISSÃO É DA PESSOA (migração 20261126001400; npm run test:local). O vendedor M1 vende nas lojas 3 e 6; o
 * administrador, com a loja 6 escolhida no topo, vê pela função as vendas do M1 nas duas lojas (a comissão soma tudo)
 * e a meta/comissão paga gravadas com outra loja. O vendedor vê só as próprias.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')

const EMPRESA = 1
const M1 = '0e5e0000-0000-4000-8000-000000000101'
const ADM = '0e5e0000-0000-4000-8000-000000000201'
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const s: Record<string, SupabaseClient> = {}
const mes = new Date().toISOString().slice(0, 7)
const ini = `${mes}-01T00:00:00Z`
const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)).toISOString()
let prod = 0
const vendas: number[] = []

before(async () => {
  for (const [quem, email] of Object.entries({ adm: 'admin.a@teste.invalid', m1: 'vendedor.matriz1@teste.invalid' })) {
    const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
    if (error) throw new Error(`login de ${quem}: ${error.message}`)
    s[quem] = c
  }
  const { data: p } = await svc.from('estoque_produtos').insert({ empresa_id: EMPRESA, nome: 'Teste comissão pessoa (integração)' } as never).select('id').single()
  prod = (p as { id: number }).id
  const agora = new Date().toISOString()
  const { data: v, error } = await svc.from('vendas_vendas').insert([
    { empresa_id: EMPRESA, filial_id: 3, produto_id: prod, valor_venda: 1000, status: 'concluida', vendedor_id: M1, data_venda: agora, concluida_em: agora },
    { empresa_id: EMPRESA, filial_id: 6, produto_id: prod, valor_venda: 500, status: 'concluida', vendedor_id: M1, data_venda: agora, concluida_em: agora },
  ] as never).select('id')
  if (error) throw error
  vendas.push(...((v ?? []) as { id: number }[]).map((x) => x.id))
  await svc.from('metas_comissoes').insert({ empresa_id: EMPRESA, filial_id: 3, usuario_id: M1, mes_ano: mes, meta_vendas_valor: 10000, percentual_comissao_padrao: 5 } as never)
  await svc.from('usuarios').update({ filial_atual_id: 6 } as never).eq('id', ADM)
})

after(async () => {
  await svc.from('usuarios').update({ filial_atual_id: null } as never).eq('id', ADM)
  await svc.from('metas_comissoes').delete().eq('empresa_id', EMPRESA).eq('usuario_id', M1).eq('mes_ano', mes)
  if (vendas.length) await svc.from('vendas_vendas').delete().in('id', vendas)
  if (prod) await svc.from('estoque_produtos').delete().eq('id', prod)
})

describe('comissão é da pessoa', () => {
  test('admin com a loja 6 no topo: as vendas do M1 nas duas lojas entram; a meta gravada com a loja 3 aparece', async () => {
    const { data, error } = await s.adm.rpc('vendas_da_equipe', { p_inicio: ini, p_fim: fim })
    assert.equal(error, null, error?.message)
    const doM1 = ((data ?? []) as { vendedor_id: string; filial_id: number; valor_venda: number }[]).filter((x) => x.vendedor_id === M1 && vendas.length)
    const porLoja: Record<number, number> = {}
    for (const x of doM1) porLoja[x.filial_id] = (porLoja[x.filial_id] ?? 0) + Number(x.valor_venda)
    assert.ok((porLoja[3] ?? 0) >= 1000 && (porLoja[6] ?? 0) >= 500, JSON.stringify(porLoja))
    const { data: meta } = await s.adm.from('metas_comissoes').select('meta_vendas_valor').eq('usuario_id', M1).eq('mes_ano', mes)
    assert.equal((meta ?? []).length, 1)
    // a RLS das vendas continua pela loja da venda: com a loja 6 no topo, só a de 6
    const { data: pelaLoja } = await s.adm.from('vendas_vendas').select('id').in('id', vendas)
    assert.equal((pelaLoja ?? []).length, 1)
  })

  test('o vendedor vê só as próprias vendas pela função', async () => {
    const { data } = await s.m1.rpc('vendas_da_equipe', { p_inicio: ini, p_fim: fim })
    const linhas = (data ?? []) as { vendedor_id: string }[]
    assert.ok(linhas.length >= 2)
    assert.ok(linhas.every((x) => x.vendedor_id === M1))
  })
})
