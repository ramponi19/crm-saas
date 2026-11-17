/**
 * Aviso de valor muito abaixo da referência do produto (17/11/2026): abaixo da metade pergunta, sem bloquear.
 * Referência = preço do catálogo; sem ele, a mediana das vendas de 90 dias (5 ou mais); o texto diz de onde veio.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  abaixoDoCatalogo, textoConfirmeValor, descricaoConfirmeValor, medianaDasVendas, medianasPorProduto, referenciaDoProduto,
} from '@/lib/valor-abaixo-do-catalogo'

const nb = (s: string) => s.replace(/ /g, ' ')
const cat = (valor: number) => ({ valor })

describe('referência', () => {
  test('o preço do catálogo vence a mediana', () => {
    assert.deepEqual(referenciaDoProduto(7000, { valor: 7695, vendas: 31 }), { valor: 7000 })
  })
  test('sem preço no catálogo, a mediana (com 5 ou mais vendas)', () => {
    assert.deepEqual(referenciaDoProduto(null, { valor: 7695, vendas: 31 }), { valor: 7695, vendas: 31 })
    assert.deepEqual(referenciaDoProduto(0, { valor: 7695, vendas: 5 }), { valor: 7695, vendas: 5 })
    assert.equal(referenciaDoProduto(null, { valor: 7695, vendas: 4 }), null)
    assert.equal(referenciaDoProduto(null, null), null)
  })
  test('mediana: ímpar, par, menos de 5, zeros fora', () => {
    assert.deepEqual(medianaDasVendas([7695, 7.6, 7895, 7495, 7695]), { valor: 7695, vendas: 5 })
    assert.deepEqual(medianaDasVendas([100, 200, 300, 400, 500, 600]), { valor: 350, vendas: 6 })
    assert.equal(medianaDasVendas([100, 200, 300, 400]), null)
    assert.equal(medianaDasVendas([100, 200, 300, 400, 0]), null)
  })
  test('medianas por produto: venda de N peças conta uma peça; produto sem 5 vendas fica fora', () => {
    const m = medianasPorProduto([
      ...[7695, 7695, 7495, 7895, 7.6].map((v) => ({ produto_id: 1, valor_venda: v, quantidade: 1 })),
      { produto_id: 2, valor_venda: 100, quantidade: 2 }, { produto_id: 2, valor_venda: 50, quantidade: 1 },
      { produto_id: null, valor_venda: 10, quantidade: 1 },
    ])
    assert.deepEqual(m, { 1: { valor: 7695, vendas: 5 } })
  })
})

describe('abaixoDoCatalogo e o texto', () => {
  test('pelo catálogo: R$ 7,60 num produto de R$ 7.695,00', () => {
    const r = abaixoDoCatalogo([{ nome: 'Produto X', valor: 7.6, referencia: cat(7695) }])
    assert.equal(r.length, 1)
    assert.equal(nb(textoConfirmeValor(r[0])), 'Confirme o valor: R$ 7,60 para um produto de R$ 7.695,00 (preço do catálogo)')
  })
  test('pela mediana: diz de onde veio a referência', () => {
    const r = abaixoDoCatalogo([{ nome: 'Produto X', valor: 7.6, referencia: { valor: 7695, vendas: 31 } }])
    assert.equal(nb(textoConfirmeValor(r[0])), 'Confirme o valor: R$ 7,60 — referência: mediana das últimas 31 vendas: R$ 7.695')
  })
  test('metade exata e acima não avisam; abaixo da metade avisa', () => {
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 500, referencia: cat(1000) }]).length, 0)
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 900, referencia: cat(1000) }]).length, 0)
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 499.99, referencia: cat(1000) }]).length, 1)
  })
  test('sem referência, ou valor zero (aviso próprio), não avisa', () => {
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 1, referencia: null }]).length, 0)
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 0, referencia: cat(1000) }]).length, 0)
  })
  test('vários itens: o texto nomeia cada um', () => {
    const r = abaixoDoCatalogo([
      { nome: 'Mesa', valor: 10, referencia: cat(2000) },
      { nome: 'Cadeira', valor: 600, referencia: cat(700) },
      { nome: 'Sofá', valor: 30, referencia: { valor: 3000, vendas: 8 } },
    ])
    assert.deepEqual(r.map((x) => x.nome), ['Mesa', 'Sofá'])
    const d = nb(descricaoConfirmeValor(r))
    assert.match(d, /Mesa: R\$ 10,00 para um produto de R\$ 2\.000,00 \(preço do catálogo\)/)
    assert.match(d, /Sofá: R\$ 30,00 — referência: mediana das últimas 8 vendas: R\$ 3\.000/)
  })
})
