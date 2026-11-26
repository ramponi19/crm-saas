/**
 * CUSTO PROTEGIDO PELA API (npm run test:local; docs/etapa-1.1-plano.md §4.3–§4.5, "Vendedor lendo custo pela API") —
 * o Vendedor e a Consulta lendo custo com sessão real.
 *   TESTE_CUSTO_TEMPO=3 (padrão; banco com a 20261126000400, 1.1f): a coluna antiga volta NULA para todos.
 *   TESTE_CUSTO_TEMPO=2 (banco sem a 0400, ou depois da volta-custo-coluna-antiga-vazia.sql; 1.1d/1.1e): a coluna
 *     antiga ainda responde como hoje (a exposição antiga que o tempo 3 fecha).
 * Nos dois: satélites vazios, junção nula e funções recusadas para quem não tem estoque.ver_custo; o Dono lê.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')

const TEMPO = process.env.TESTE_CUSTO_TEMPO === '2' ? 2 : 3
const EMPRESA = 1
const M2 = '0e5e0000-0000-4000-8000-000000000102'
const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const s: Record<string, SupabaseClient> = {}
let unidade = 0, venda = 0, pedido = 0, produto = 0, cargoVendedor = 0, cargoConsulta = 0

async function entrar(email: string) {
  const c = createClient(URL_LOCAL, process.env.TESTE_LOCAL_ANON!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: 'teste-local-123' })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

before(async () => {
  s.dono = await entrar('dono.jm@teste.invalid')
  s.vendedor = await entrar('vendedor.matriz1@teste.invalid')
  s.consulta = await entrar('vendedor.matriz2@teste.invalid')
  const { data: cargos } = await svc.from('empresa_cargos').select('id, nome').eq('empresa_id', EMPRESA)
  cargoVendedor = (cargos as { id: number; nome: string }[]).find((c) => c.nome === 'Vendedor')!.id
  cargoConsulta = (cargos as { id: number; nome: string }[]).find((c) => c.nome === 'Consulta')!.id
  await svc.from('empresa_usuarios').update({ cargo_id: cargoConsulta }).eq('empresa_id', EMPRESA).eq('usuario_id', M2)

  const p = await svc.from('estoque_produtos').insert({ empresa_id: EMPRESA, nome: 'Produto custo API' } as never).select('id').single()
  produto = (p.data as { id: number }).id
  const u = await svc.from('estoque_unidades').insert({ empresa_id: EMPRESA, filial_id: 3, produto_id: produto, preco_custo: 1234, custo_reparo: 66, status: 'vendido' } as never).select('id').single()
  unidade = (u.data as { id: number }).id
  const v = await svc.from('vendas_vendas').insert({ empresa_id: EMPRESA, filial_id: 3, produto_id: produto, unidade_id: unidade, valor_venda: 2000, valor_custo: 1, status: 'concluida' } as never).select('id').single()
  venda = (v.data as { id: number }).id
  const c = await svc.from('compras_pedidos').insert({ empresa_id: EMPRESA, filial_id: 3, descricao: 'pedido API', valor_total: 4321 } as never).select('id').single()
  pedido = (c.data as { id: number }).id
})

after(async () => {
  await svc.from('empresa_usuarios').update({ cargo_id: cargoVendedor, participa_roleta: true, atende_clientes: true } as never).eq('empresa_id', EMPRESA).eq('usuario_id', M2)
  if (venda) await svc.from('vendas_vendas').delete().eq('id', venda)
  if (pedido) await svc.from('compras_pedidos').delete().eq('id', pedido)
  if (unidade) await svc.from('estoque_unidades').delete().eq('id', unidade)
  if (produto) await svc.from('estoque_produtos').delete().eq('id', produto)
})

for (const quem of ['vendedor', 'consulta'] as const) {
  describe(`${quem}: nenhuma exposição nova pela API`, () => {
    test('satélites: 0 linhas', async () => {
      for (const t of ['estoque_unidades_custos', 'vendas_vendas_custos', 'compras_pedidos_custos']) {
        const { data, error } = await s[quem].from(t).select('*')
        assert.equal(error, null, `${t}: ${error?.message}`)
        assert.equal((data ?? []).length, 0, t)
      }
    })
    test('junção do satélite volta nula', async () => {
      const { data, error } = await s[quem].from('estoque_unidades').select('id, estoque_unidades_custos(*)').eq('id', unidade).single()
      assert.equal(error, null, error?.message)
      assert.equal((data as { estoque_unidades_custos: unknown }).estoque_unidades_custos, null)
    })
    test('funções de custo recusadas (SEM_PERMISSAO)', async () => {
      const chamadas: [string, Record<string, unknown>][] = [
        ['estoque_custos_pendentes', {}], ['venda_resultado', { p_venda: venda }],
        ['estoque_custo_informar', { p_unidade: unidade, p_custo: 1 }],
      ]
      for (const [fn, args] of chamadas) {
        const { error } = await s[quem].rpc(fn as never, args as never)
        assert.match(error?.message ?? 'passou', /SEM_PERMISSAO/, fn)
      }
    })
    test(TEMPO === 3 ? 'coluna antiga: nula (tempo 3)' : 'coluna antiga: os mesmos valores de hoje (tempo 2; fecha no 3)', async () => {
      const u = await s[quem].from('estoque_unidades').select('preco_custo, custo_reparo').eq('id', unidade).single()
      const v = await s[quem].from('vendas_vendas').select('valor_custo, lucro').eq('id', venda).single()
      const c = await s[quem].from('compras_pedidos').select('valor_total').eq('id', pedido).single()
      const lido = [
        (u.data as { preco_custo: number | null }).preco_custo, (u.data as { custo_reparo: number | null }).custo_reparo,
        (v.data as { valor_custo: number | null }).valor_custo, (v.data as { lucro: number | null }).lucro,
        (c.data as { valor_total: number | null }).valor_total,
      ].map((x) => (x === null ? null : Number(x)))
      // tempo 2: venda com o custo da unidade (1234, não o 1 mandado) e lucro 2000 − 1234
      assert.deepEqual(lido, TEMPO === 3 ? [null, null, null, null, null] : [1234, 66, 1234, 766, 4321])
    })
    test('itens.custo: nulo', async () => {
      const { data } = await s[quem].from('itens').select('custo').eq('ref_tabela', 'estoque_unidades').eq('ref_id', unidade)
      for (const i of (data ?? []) as { custo: number | null }[]) assert.equal(i.custo, null)
    })
  })
}

describe('dono: lê os satélites, com os mesmos valores da coluna antiga', () => {
  test('satélites', async () => {
    const u = await s.dono.from('estoque_unidades_custos').select('preco_custo, custo_reparo').eq('unidade_id', unidade).single()
    assert.deepEqual([Number((u.data as { preco_custo: number }).preco_custo), Number((u.data as { custo_reparo: number }).custo_reparo)], [1234, 66])
    const v = await s.dono.from('vendas_vendas_custos').select('valor_custo').eq('venda_id', venda).single()
    assert.equal(Number((v.data as { valor_custo: number }).valor_custo), 1234)
    const c = await s.dono.from('compras_pedidos_custos').select('valor_total').eq('pedido_id', pedido).single()
    assert.equal(Number((c.data as { valor_total: number }).valor_total), 4321)
  })
  test('junção e resultado da venda', async () => {
    const { data } = await s.dono.from('estoque_unidades').select('id, estoque_unidades_custos(preco_custo)').eq('id', unidade).single()
    // relação 1:1 (a PK do satélite é a FK): o PostgREST devolve objeto
    assert.equal(Number((data as unknown as { estoque_unidades_custos: { preco_custo: number } }).estoque_unidades_custos.preco_custo), 1234)
    const r = await s.dono.rpc('venda_resultado' as never, { p_venda: venda } as never)
    assert.equal(r.error, null, r.error?.message)
    assert.equal(Number((r.data as { lucro: number }).lucro), 766)
  })
  test(TEMPO === 3 ? 'colunas antigas vazias na empresa inteira (tempo 3)' : 'somas da empresa: coluna antiga = satélite (tempo 2)', async () => {
    if (TEMPO === 3) {
      const [u, v, c] = await Promise.all([
        svc.from('estoque_unidades').select('id', { count: 'exact', head: true }).eq('empresa_id', EMPRESA).or('preco_custo.not.is.null,custo_reparo.not.is.null'),
        svc.from('vendas_vendas').select('id', { count: 'exact', head: true }).eq('empresa_id', EMPRESA).or('valor_custo.not.is.null,lucro.not.is.null'),
        svc.from('compras_pedidos').select('id', { count: 'exact', head: true }).eq('empresa_id', EMPRESA).not('valor_total', 'is', null),
      ])
      assert.deepEqual([u.count, v.count, c.count], [0, 0, 0])
      return
    }
    const soma = (linhas: Record<string, unknown>[] | null, k: string) => (linhas ?? []).reduce((a, l) => a + Number(l[k] ?? 0), 0)
    const [ua, us] = await Promise.all([svc.from('estoque_unidades').select('preco_custo').eq('empresa_id', EMPRESA), s.dono.from('estoque_unidades_custos').select('preco_custo').eq('empresa_id', EMPRESA)])
    assert.equal(soma(us.data, 'preco_custo'), soma(ua.data, 'preco_custo'))
    const [va, vs] = await Promise.all([svc.from('vendas_vendas').select('valor_custo').eq('empresa_id', EMPRESA), s.dono.from('vendas_vendas_custos').select('valor_custo').eq('empresa_id', EMPRESA)])
    assert.equal(soma(vs.data, 'valor_custo'), soma(va.data, 'valor_custo'))
  })
})
