/**
 * Faturamento pelo MÊS DA CONCLUSÃO (aprovado em 25/11/2026: `coalesce(concluida_em, data_venda)`).
 * Desde o hotfix H1, a encomenda guarda o lançamento em data_venda e a entrega em concluida_em.
 * O painel, Financeiro, Visão geral, Metas, Ranking, Relatórios e o assistente contam pela conclusão;
 * encomenda e pendente de entrega ficam num bloco "Em aberto", fora do faturamento.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { dataDaConclusao, filtroConcluidaDesde, filtroConcluidaNoPeriodo, resumoEmAberto } from '@/lib/vendas-mes'
import { resultadosDoPainel, type VendaDoPainel } from '@/lib/painel/metricas'

const FUSO = 'America/Sao_Paulo'
// 25/11/2026 15h em Brasília.
const AGORA = new Date('2026-11-25T18:00:00.000Z')
const ESCOPO = { soMeu: false, userId: null, papel: 'owner', motivo: '' } as unknown as Parameters<typeof resultadosDoPainel>[2]

function venda(p: Partial<VendaDoPainel> & { id: number }): VendaDoPainel {
  return {
    valor_venda: 1000, valor_custo: null, data_venda: null, concluida_em: null, canal_venda: 'loja_fisica',
    forma_pagamento: 'pix', status: 'concluida', vendedor_id: 'u1', produto_nome: 'iPhone', cliente_nome: 'Cliente',
    ...p,
  }
}

// Encomenda lançada em outubro, entregue em novembro.
const ENCOMENDA = venda({ id: 1, valor_venda: 5000, data_venda: '2026-10-20T15:00:00.000Z', concluida_em: '2026-11-18T17:30:00.000Z' })
// Venda de balcão de novembro, anterior ao hotfix (sem concluida_em).
const BALCAO_NOV = venda({ id: 2, valor_venda: 1200, data_venda: '2026-11-05T14:00:00.000Z' })
// Venda de balcão de outubro.
const BALCAO_OUT = venda({ id: 3, valor_venda: 800, data_venda: '2026-10-10T14:00:00.000Z' })

describe('dataDaConclusao', () => {
  test('encomenda: a entrega; venda sem concluida_em: data_venda', () => {
    assert.equal(dataDaConclusao(ENCOMENDA), '2026-11-18T17:30:00.000Z')
    assert.equal(dataDaConclusao(BALCAO_NOV), '2026-11-05T14:00:00.000Z')
    assert.equal(dataDaConclusao({}), null)
  })
})

describe('filtros do PostgREST', () => {
  test('no período: concluida_em no intervalo OU (sem concluida_em e data_venda no intervalo)', () => {
    assert.equal(
      filtroConcluidaNoPeriodo('2026-11-01T03:00:00.000Z', '2026-12-01T03:00:00.000Z'),
      'and(concluida_em.gte."2026-11-01T03:00:00.000Z",concluida_em.lt."2026-12-01T03:00:00.000Z"),'
      + 'and(concluida_em.is.null,data_venda.gte."2026-11-01T03:00:00.000Z",data_venda.lt."2026-12-01T03:00:00.000Z")',
    )
  })
  test('desde: sem fim', () => {
    assert.equal(
      filtroConcluidaDesde('2026-11-01T03:00:00.000Z'),
      'concluida_em.gte."2026-11-01T03:00:00.000Z",and(concluida_em.is.null,data_venda.gte."2026-11-01T03:00:00.000Z")',
    )
  })
})

describe('painel pelo mês da conclusão', () => {
  const r = resultadosDoPainel([ENCOMENDA, BALCAO_NOV, BALCAO_OUT], {
    vendedores: [{ id: 'u1', nome: 'Ana' }], metaPorUsuario: {},
  }, ESCOPO, FUSO, AGORA)

  test('encomenda lançada em outubro e entregue em novembro conta no mês de NOVEMBRO', () => {
    assert.equal(r.periods.mes.receita, 6200)   // encomenda 5000 + balcão de novembro 1200
    assert.equal(r.periods.mes.qtdVendas, 2)
  })
  test('faturamento mensal: outubro só com o balcão de outubro', () => {
    const porMes = Object.fromEntries(r.faturamentoMensal.map((m) => [m.mes, m.total]))
    assert.equal(porMes['2026-10'], 800)
    assert.equal(porMes['2026-11'], 6200)
  })
  test('7 dias: a entrega de 18/11 entra (o lançamento de 20/10 ficaria de fora)', () => {
    assert.equal(r.periods['7d'].receita, 5000)
  })
  test('ranking do mês soma a encomenda para o vendedor', () => {
    assert.deepEqual(r.topVendedores.map((v) => [v.nome, v.total, v.qtd]), [['Ana', 6200, 2]])
  })
  test('encomenda ainda aberta não entra no faturamento', () => {
    const aberta = venda({ id: 9, status: 'encomenda', data_venda: '2026-11-20T15:00:00.000Z' })
    const r2 = resultadosDoPainel([aberta, BALCAO_NOV], { vendedores: [], metaPorUsuario: {} }, ESCOPO, FUSO, AGORA)
    assert.equal(r2.periods.mes.receita, 1200)
  })
})

describe('Em aberto (fora do faturamento)', () => {
  test('soma valor, sinal e falta; fechamento do PDV com 2 itens conta 1 pedido', () => {
    const r = resumoEmAberto([
      // PDV: 2 itens do mesmo fechamento; o sinal está gravado só na primeira linha
      { id: 10, valor_venda: 3000, status: 'encomenda', grupo_pdv: 'g1', pagamentos: [{ valor_pago: 500 }] },
      { id: 11, valor_venda: 200, status: 'encomenda', grupo_pdv: 'g1', pagamentos: [] },
      { id: 12, valor_venda: '1500.50', status: 'pendente_entrega', grupo_pdv: null, pagamentos: [{ valor_pago: '1500.50' }] },
      // concluída não entra
      { id: 13, valor_venda: 999, status: 'concluida', grupo_pdv: null, pagamentos: [{ valor_pago: 999 }] },
    ])
    assert.deepEqual(r, { pedidos: 2, valor: 4700.5, sinal: 2000.5, falta: 2700 })
  })
  test('nada em aberto: zeros', () => {
    assert.deepEqual(resumoEmAberto([]), { pedidos: 0, valor: 0, sinal: 0, falta: 0 })
    assert.deepEqual(resumoEmAberto(null), { pedidos: 0, valor: 0, sinal: 0, falta: 0 })
  })
})

// ── a consulta, executada num PostgREST falso que aplica os filtros de verdade ────────────────────────
import { postgrestFalso } from './postgrest-falso'
import { vendasDoPeriodo } from '@/lib/vendas-periodo'
import { executar, type Contexto } from '@/lib/assistente/ferramentas'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A loja: 1.200 vendas de balcão em novembro (mais de uma página de 1.000) e, lançada ANTES de todas elas,
 * a encomenda 1: lançada em 01/08, entregue em 18/11. Pelo lançamento ela é a mais antiga de 1.201 — fora das
 * "500 mais recentes" que os Relatórios carregavam. Mais: uma encomenda ainda aberta (com sinal), uma venda
 * concluída em outubro e uma devolvida em novembro.
 */
function loja() {
  const vendas: Record<string, unknown>[] = [
    { id: 1, empresa_id: 1, filial_id: 3, status: 'concluida', valor_venda: 5000, valor_custo: 0, quantidade: 1, grupo_pdv: null,
      vendedor_id: 'u1', data_venda: '2026-08-01T15:00:00.000Z', concluida_em: '2026-11-18T17:30:00.000Z', created_at: '2026-08-01T15:00:00.000Z' },
  ]
  for (let i = 0; i < 1200; i++) {
    const dia = String(1 + (i % 24)).padStart(2, '0')
    vendas.push({ id: 100 + i, empresa_id: 1, filial_id: 3, status: 'concluida', valor_venda: 100, valor_custo: 0, quantidade: 1,
      grupo_pdv: null, vendedor_id: 'u1', data_venda: `2026-11-${dia}T15:00:00.000Z`, concluida_em: null, created_at: `2026-11-${dia}T15:00:00.000Z` })
  }
  vendas.push(
    { id: 2001, empresa_id: 1, filial_id: 3, status: 'encomenda', valor_venda: 3000, valor_custo: 0, quantidade: 1, grupo_pdv: null,
      vendedor_id: 'u1', data_venda: '2026-11-20T15:00:00.000Z', concluida_em: null, created_at: '2026-11-20T15:00:00.000Z' },
    { id: 2002, empresa_id: 1, filial_id: 3, status: 'concluida', valor_venda: 700, valor_custo: 0, quantidade: 1, grupo_pdv: null,
      vendedor_id: 'u1', data_venda: '2026-10-10T15:00:00.000Z', concluida_em: null, created_at: '2026-10-10T15:00:00.000Z' },
    { id: 2003, empresa_id: 1, filial_id: 3, status: 'devolvido', valor_venda: 900, valor_custo: 0, quantidade: 1, grupo_pdv: null,
      vendedor_id: 'u1', data_venda: '2026-11-10T15:00:00.000Z', concluida_em: null, created_at: '2026-11-10T15:00:00.000Z' },
    // outra empresa, mesmo período
    { id: 3001, empresa_id: 2, filial_id: 9, status: 'concluida', valor_venda: 999, valor_custo: 0, quantidade: 1, grupo_pdv: null,
      vendedor_id: 'u9', data_venda: '2026-11-05T15:00:00.000Z', concluida_em: null, created_at: '2026-11-05T15:00:00.000Z' },
  )
  return postgrestFalso({
    vendas_vendas: vendas,
    vendas_pagamentos: [{ id: 1, venda_id: 2001, valor_pago: 800 }],
    filiais: [{ id: 3, empresa_id: 1, nome: 'JM · Mogi Guaçu', cidade: 'Mogi Guaçu' }],
    empresa_usuarios: [{ usuario_id: 'u1', empresa_id: 1 }],
    estoque_produtos: [],
  }, { vendas_pagamentos: 'venda_id' })
}

describe('Relatórios: o período vai para o banco, pela conclusão, sem teto', () => {
  test('encomenda lançada há mais de 500 vendas e entregue no período ENTRA', async () => {
    const db = loja()
    const vendas = await vendasDoPeriodo<{ id: number; status: string; data_venda: string; concluida_em: string | null }>(
      db as unknown as SupabaseClient, 1, 'id, status, data_venda, concluida_em', { de: '2026-11-01', ate: '2026-11-30' }, FUSO)
    const ids = new Set(vendas.map((v) => v.id))
    assert.ok(ids.has(1), 'a encomenda entregue em 18/11 tem de estar no relatório de novembro')
    // 1.200 de balcão + a encomenda + a devolvida (a lista mostra o status; os KPIs só somam concluídas,
    // como antes) — duas páginas de 1.000 lidas até o fim
    assert.equal(vendas.length, 1202)
    assert.ok(ids.has(2003))
    assert.ok(!ids.has(2001), 'encomenda aberta fica fora (é o bloco Em aberto)')
    assert.ok(!ids.has(2002), 'venda de outubro fica fora')
    assert.ok(!ids.has(3001), 'outra empresa fica fora')
    // ordenadas pela conclusão: a encomenda (18/11 17h30) vem antes das vendas de 18/11 15h
    assert.ok(vendas.findIndex((v) => v.id === 1) < vendas.findIndex((v) => v.id === 117))
  })
  test('a consulta antiga (500 mais recentes pelo lançamento) perdia a encomenda — o defeito corrigido', async () => {
    const { data } = await loja().from('vendas_vendas').select('id').eq('empresa_id', 1)
      .not('status', 'in', '("encomenda","pendente_entrega")').order('data_venda', { ascending: false }).limit(500)
    assert.ok(!(data as { id: number }[]).some((v) => v.id === 1))
  })
  test('o relatório de agosto (mês do lançamento) NÃO tem a encomenda', async () => {
    const vendas = await vendasDoPeriodo<{ id: number }>(loja() as unknown as SupabaseClient, 1, 'id', { de: '2026-08-01', ate: '2026-08-31' }, FUSO)
    assert.deepEqual(vendas.map((v) => v.id), [])
  })
})

describe('Assistente: faturamento = só concluídas pela conclusão; em aberto à parte', () => {
  test('novembro: 1.200 balcão + encomenda entregue; sem a aberta, sem a devolvida, sem outubro', async () => {
    const db = loja() as unknown as SupabaseClient
    const c: Contexto = {
      db, svc: db, ler: db, fuso: FUSO,
      acesso: { empresaId: 1, userId: 'u1', nome: 'Dono', papel: 'owner', soMinhasVendas: false, soMeusLeads: false, verCusto: true },
      recorte: { alcance: [3], loja: null, rotulo: 'Rede JM', escolheLoja: true },
    }
    const r = JSON.parse(await executar(c, 'vendas_resumo', { de: '2026-11-01', ate: '2026-11-30' }))
    assert.equal(r.totais.vendas, 1201)
    assert.equal(r.totais.faturamento, 1200 * 100 + 5000)
    assert.equal(r.totais.encomendas_pendentes, undefined)
    assert.deepEqual(r.em_aberto && { pedidos: r.em_aberto.pedidos, valor: r.em_aberto.valor, sinal: r.em_aberto.sinal_recebido, falta: r.em_aberto.falta_receber },
      { pedidos: 1, valor: 3000, sinal: 800, falta: 2200 })
  })
  test('agrupado por dia: a encomenda cai em 18/11, não em 01/08', async () => {
    const db = loja() as unknown as SupabaseClient
    const c: Contexto = {
      db, svc: db, ler: db, fuso: FUSO,
      acesso: { empresaId: 1, userId: 'u1', nome: 'Dono', papel: 'owner', soMinhasVendas: false, soMeusLeads: false, verCusto: true },
      recorte: { alcance: [3], loja: null, rotulo: 'Rede JM', escolheLoja: true },
    }
    const r = JSON.parse(await executar(c, 'vendas_resumo', { de: '2026-08-01', ate: '2026-11-30', agrupar_por: 'dia' }))
    const porDia = Object.fromEntries((r.grupos as { grupo: string; faturamento: number }[]).map((g) => [g.grupo, g.faturamento]))
    assert.equal(porDia['2026-08-01'], undefined)
    assert.equal(porDia['2026-11-18'], 50 * 100 + 5000)   // 50 vendas de balcão nesse dia + a encomenda
    assert.equal(porDia['2026-10-10'], 700)
  })
})
