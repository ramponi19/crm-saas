/**
 * Aviso de valor muito abaixo do preço do catálogo (17/11/2026): abaixo da metade pergunta, sem bloquear.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { abaixoDoCatalogo, textoConfirmeValor, descricaoConfirmeValor } from '@/lib/valor-abaixo-do-catalogo'

const nb = (s: string) => s.replace(/ /g, ' ')

describe('abaixoDoCatalogo', () => {
  test('o caso real: R$ 7,60 num produto de R$ 7.695,00', () => {
    const r = abaixoDoCatalogo([{ nome: 'Produto X', valor: 7.6, precoCatalogo: 7695 }])
    assert.equal(r.length, 1)
    assert.equal(nb(textoConfirmeValor(r[0])), 'Confirme o valor: R$ 7,60 para um produto de R$ 7.695,00')
  })
  test('metade exata e acima não avisam; abaixo da metade avisa', () => {
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 500, precoCatalogo: 1000 }]).length, 0)
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 900, precoCatalogo: 1000 }]).length, 0)
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 499.99, precoCatalogo: 1000 }]).length, 1)
  })
  test('sem preço no catálogo, ou valor zero (aviso próprio), não avisa', () => {
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 1, precoCatalogo: null }]).length, 0)
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 1, precoCatalogo: 0 }]).length, 0)
    assert.equal(abaixoDoCatalogo([{ nome: 'a', valor: 0, precoCatalogo: 1000 }]).length, 0)
  })
  test('vários itens: o texto nomeia cada um', () => {
    const r = abaixoDoCatalogo([
      { nome: 'Mesa', valor: 10, precoCatalogo: 2000 },
      { nome: 'Cadeira', valor: 600, precoCatalogo: 700 },
      { nome: 'Sofá', valor: 30, precoCatalogo: 3000 },
    ])
    assert.deepEqual(r.map((x) => x.nome), ['Mesa', 'Sofá'])
    const d = nb(descricaoConfirmeValor(r))
    assert.match(d, /Mesa: R\$ 10,00 para um produto de R\$ 2\.000,00/)
    assert.match(d, /Sofá: R\$ 30,00 para um produto de R\$ 3\.000,00/)
  })
})
