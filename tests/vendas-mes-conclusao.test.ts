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
