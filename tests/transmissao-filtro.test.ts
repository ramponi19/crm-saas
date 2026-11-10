import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TETO_MAX, TETO_PADRAO, descreverFiltro, filtroImpossivel, normalizarFiltro, renderizar, tetoValido, variaveisDoModelo,
} from '@/lib/transmissao/filtro'
import { MODULOS } from '@/core/modulos'
import { VITRINES } from '@/lib/modulos-vitrine'
import { CATALOGO, GRUPO_DO_HREF } from '@/lib/menu'

test('filtro: só as chaves conhecidas, limpas', () => {
  const f = normalizarFiltro({
    funil_id: '3', etapa_ids: [5, '5', 7, 'x', -1, 2.5], situacoes: ['perdido', 'ganho', 'qualquer', 'perdido'],
    origens: [' WhatsApp ', 'whatsapp', '', 'Instagram'], sem_mensagem_ha_dias: '30', com_mensagem_nos_dias: 0,
    lixo: 'fora', etiqueta_ids: [1],
  })
  assert.deepEqual(f, {
    funil_id: 3, etapa_ids: [5, 7], situacoes: ['perdido', 'ganho'], origens: ['whatsapp', 'instagram'], sem_mensagem_ha_dias: 30,
  })
})

test('filtro: vazio, nulo e lixo viram "todos os contatos da loja"', () => {
  for (const b of [null, undefined, 'x', 42, [], { etapa_ids: [], situacoes: [], sem_mensagem_ha_dias: 'abc' }]) {
    assert.deepEqual(normalizarFiltro(b), {})
  }
  assert.equal(descreverFiltro({}, { funis: new Map(), etapas: new Map() }), 'todos os contatos da loja')
})

test('filtro: dias fora da faixa saem', () => {
  assert.deepEqual(normalizarFiltro({ sem_mensagem_ha_dias: 4000, com_mensagem_nos_dias: -3 }), {})
  assert.deepEqual(normalizarFiltro({ com_mensagem_nos_dias: 3650 }), { com_mensagem_nos_dias: 3650 })
})

test('filtro impossível: "sem há 30" com "com nos últimos 10" não deixa ninguém', () => {
  assert.match(filtroImpossivel({ sem_mensagem_ha_dias: 30, com_mensagem_nos_dias: 10 }) ?? '', /não deixam ninguém/)
  assert.equal(filtroImpossivel({ sem_mensagem_ha_dias: 10, com_mensagem_nos_dias: 30 }), null) // entre 10 e 30 dias atrás
  assert.equal(filtroImpossivel({ sem_mensagem_ha_dias: 10 }), null)
})

test('descrição em português, com os nomes do funil e das etapas', () => {
  const nomes = { funis: new Map([[1, 'Vendas']]), etapas: new Map([[5, 'Proposta'], [7, 'Negociação']]) }
  assert.equal(
    descreverFiltro({ funil_id: 1, etapa_ids: [5, 7], situacoes: ['aberto'], origens: ['whatsapp'], sem_mensagem_ha_dias: 15 }, nomes),
    'funil Vendas · etapa Proposta ou Negociação · em aberto · origem whatsapp · sem mensagem há mais de 15 dias',
  )
})

test('variáveis do modelo e o texto que fica na conversa', () => {
  assert.equal(variaveisDoModelo('Oi {{1}}, sua {{2}} chegou. {{1}}'), 2)
  assert.equal(variaveisDoModelo('Sem variável'), 0)
  assert.equal(variaveisDoModelo(null), 0)
  const r = renderizar('Oi {{1}}, temos {{2}}', ['{{nome}}', ' iPhone 15 '], 'Ana')
  assert.deepEqual(r, { parametros: ['Ana', 'iPhone 15'], previa: 'Oi Ana, temos iPhone 15' })
  assert.equal(renderizar('Oi {{1}}', ['{{nome}}'], null).previa, 'Oi ')
})

test('teto por hora: padrão 50, faixa 1..1000', () => {
  assert.equal(tetoValido(null), TETO_PADRAO)
  assert.equal(tetoValido({ teto_hora: 120 }), 120)
  assert.equal(tetoValido({ teto_hora: 0 }), TETO_PADRAO)
  assert.equal(tetoValido({ teto_hora: TETO_MAX + 1 }), TETO_PADRAO)
  assert.equal(tetoValido({ teto_hora: '80' }), 80)
})

test('nasce como módulo: manifesto, menu, grupo e vitrine', () => {
  const m = MODULOS.find((x) => x.chave === 'transmissao')
  assert.ok(m, 'no manifesto')
  assert.equal(m!.href, '/transmissao')
  assert.equal(m!.grupo, 'comunicacao')
  assert.ok(!m!.addon && !m!.emPreparacao, 'instalável pelo dono')
  assert.ok(CATALOGO.some((g) => g.items.some((i) => i.href === '/transmissao' && i.opcional)), 'item opcional no menu')
  assert.equal(GRUPO_DO_HREF['/transmissao'], 'comunicacao')
  assert.ok(VITRINES['/transmissao'], 'vitrine quando desligado')
})
