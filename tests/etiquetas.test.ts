import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alternarNoFiltro, corValida, descreverFiltroEtiquetas, etiquetasDoContato, filtroEtiquetasAtivo,
  filtroEtiquetasDaUrl, filtroEtiquetasNaUrl, fraseDoHistorico, normalizarFiltroEtiquetas, passaNoFiltro, validarNome,
  type Etiqueta,
} from '@/lib/etiquetas'
import { descreverFiltro, normalizarFiltro } from '@/lib/transmissao/filtro'

const TODAS: Etiqueta[] = [
  { id: 3, nome: 'Quente', cor: 'vermelho' },
  { id: 7, nome: 'VIP', cor: 'azul' },
  { id: 9, nome: 'Sumiu', cor: 'cinza' },
]

test('nome: limpa espaços, recusa vazio, longo e repetido (sem caixa)', () => {
  assert.deepEqual(validarNome('  Cliente   VIP ', TODAS), { nome: 'Cliente VIP' })
  assert.ok('erro' in validarNome('   ', TODAS))
  assert.ok('erro' in validarNome('x'.repeat(41), TODAS))
  assert.match((validarNome(' vip ', TODAS) as { erro: string }).erro, /Já existe/)
  // Renomear para o próprio nome (outra caixa) pode.
  assert.deepEqual(validarNome('Vip', TODAS, 7), { nome: 'Vip' })
})

test('cor: fora da paleta vira cinza', () => {
  assert.equal(corValida('azul'), 'azul')
  assert.equal(corValida('#ff0000'), 'cinza')
  assert.equal(corValida(undefined), 'cinza')
})

test('filtro: limpo, sem repetição, "não contém" vence quando a etiqueta está nas duas', () => {
  assert.deepEqual(normalizarFiltroEtiquetas({ com: [7, '3', 7, 'x', -1, 2.5], sem: [9, 3] }), { com: [7], sem: [3, 9] })
  assert.deepEqual(normalizarFiltroEtiquetas(null), { com: [], sem: [] })
  assert.equal(filtroEtiquetasAtivo({ com: [], sem: [] }), false)
  assert.equal(filtroEtiquetasAtivo({ com: [], sem: [1] }), true)
})

test('clique no filtro: neutro → contém → não contém → neutro', () => {
  let f = { com: [] as number[], sem: [] as number[] }
  f = alternarNoFiltro(f, 7); assert.deepEqual(f, { com: [7], sem: [] })
  f = alternarNoFiltro(f, 7); assert.deepEqual(f, { com: [], sem: [7] })
  f = alternarNoFiltro(f, 7); assert.deepEqual(f, { com: [], sem: [] })
})

test('passa no filtro: contém = alguma; não contém = nenhuma; as duas juntas valem as duas', () => {
  assert.equal(passaNoFiltro([3], { com: [3, 7], sem: [] }), true)
  assert.equal(passaNoFiltro([9], { com: [3, 7], sem: [] }), false)
  assert.equal(passaNoFiltro([], { com: [3], sem: [] }), false)
  assert.equal(passaNoFiltro([3, 9], { com: [], sem: [9] }), false)
  assert.equal(passaNoFiltro(null, { com: [], sem: [9] }), true)
  assert.equal(passaNoFiltro([3, 9], { com: [3], sem: [9] }), false)
  assert.equal(passaNoFiltro([3], { com: [3], sem: [9] }), true)
})

test('URL: et (contém) e etn (não contém) vão e voltam', () => {
  const sp = new URLSearchParams('filtro=aguardando')
  filtroEtiquetasNaUrl(sp, { com: [3, 7], sem: [9] })
  assert.equal(sp.toString(), 'filtro=aguardando&et=3%2C7&etn=9')
  assert.deepEqual(filtroEtiquetasDaUrl(sp), { com: [3, 7], sem: [9] })
  filtroEtiquetasNaUrl(sp, { com: [], sem: [] })
  assert.equal(sp.toString(), 'filtro=aguardando')
})

test('etiquetas do contato: só as que existem (apagada some), na ordem da lista', () => {
  assert.deepEqual(etiquetasDoContato([9, 3, 99], TODAS).map((e) => e.nome), ['Quente', 'Sumiu'])
  assert.deepEqual(etiquetasDoContato(null, TODAS), [])
})

test('descrição e histórico em português', () => {
  assert.equal(descreverFiltroEtiquetas({ com: [3, 7], sem: [9] }, TODAS), 'com Quente ou VIP · sem Sumiu')
  assert.equal(fraseDoHistorico('etiqueta_aplicada', { nome: 'VIP' }), 'Etiqueta aplicada: VIP')
  assert.equal(fraseDoHistorico('etiqueta_tirada', { nome: 'VIP', motivo: 'etiqueta apagada' }), 'Etiqueta tirada: VIP (etiqueta apagada)')
  assert.equal(fraseDoHistorico('etapa', null), null)
})

test('Transmissão: etiquetas_com / etiquetas_sem no filtro, limpas e descritas', () => {
  assert.deepEqual(normalizarFiltro({ etiquetas_com: [7, '3', 'x', 9], etiquetas_sem: [9, 9] }), { etiquetas_com: [7, 3], etiquetas_sem: [9] })
  assert.deepEqual(normalizarFiltro({ etiquetas_com: [], etiquetas_sem: 'x' }), {})
  const nomes = { funis: new Map(), etapas: new Map(), etiquetas: new Map(TODAS.map((e) => [e.id, e.nome] as [number, string])) }
  assert.equal(descreverFiltro({ etiquetas_com: [3, 7], etiquetas_sem: [9] }, nomes), 'com etiqueta Quente ou VIP · sem etiqueta Sumiu')
})
