import test from 'node:test'
import assert from 'node:assert/strict'
import {
  descricaoDaCompra, diasDesdeAVenda, grupoDoDia, montarMensagem, ordenarFila, primeiroNome, rotuloDoPasso, textoDias,
} from '@/lib/posvenda/fila'
import { linkWhatsApp } from '@/lib/whatsapp-link'

// C7 bloco 2 (24/11/2026): as regras puras da fila /pos-venda.

test('grupo: antes de hoje = atrasados; hoje; depois = próximos', () => {
  assert.equal(grupoDoDia('2026-11-23', '2026-11-24'), 'atrasados')
  assert.equal(grupoDoDia('2026-11-24', '2026-11-24'), 'hoje')
  assert.equal(grupoDoDia('2026-11-30', '2026-11-24'), 'proximos')
})

test('passo: "D+7 Experiência", sem repetir o dia quando o título já traz', () => {
  assert.equal(rotuloDoPasso(7, 'Experiência'), 'D+7 Experiência')
  assert.equal(rotuloDoPasso(7, 'D+7 experiência'), 'D+7 experiência')
  assert.equal(rotuloDoPasso(null, 'Ligar'), 'Ligar')
})

test('mensagem: variáveis trocadas; vazia some; desconhecida fica', () => {
  const r = 'Oi {{nome}}, tudo certo com o seu {{produto}}? Aqui é {{vendedor}}, da {{loja}}.'
  assert.equal(montarMensagem(r, { nome: 'Ana Paula Souza', produto: 'iPhone 15', vendedor: 'Milena Reis', loja: 'Matriz' }),
    'Oi Ana, tudo certo com o seu iPhone 15? Aqui é Milena, da Matriz.')
  assert.equal(montarMensagem('Oi {{nome}}, e o {{produto}}!', { nome: 'Ana' }), 'Oi Ana, e o!')
  assert.equal(montarMensagem('Oi {{ NOME }} {{cupom}}', { nome: 'Bia' }), 'Oi Bia {{cupom}}')
  assert.equal(montarMensagem(null, { nome: 'Ana' }), '')
  assert.equal(primeiroNome('  '), '')
})

test('compra: produto (ou categoria) e a condição no vocabulário da empresa', () => {
  assert.equal(descricaoDaCompra('iPhone 15 Pro', 'iPhone', 'seminovo', 'Seminovo'), 'iPhone 15 Pro · Seminovo')
  assert.equal(descricaoDaCompra('', 'Acessórios', 'novo'), 'Acessórios · Novo')
  assert.equal(descricaoDaCompra(null, null, null), null)
})

test('dias desde a venda e o texto', () => {
  assert.equal(diasDesdeAVenda('2026-11-17', '2026-11-24'), 7)
  assert.equal(diasDesdeAVenda('2026-11-24', '2026-11-24'), 0)
  assert.equal(diasDesdeAVenda(null, '2026-11-24'), null)
  assert.equal(diasDesdeAVenda('24/11/2026', '2026-11-24'), null)
  assert.equal(textoDias(0), 'hoje')
  assert.equal(textoDias(1), '1 dia')
  assert.equal(textoDias(12), '12 dias')
})

test('ordem: atrasados, hoje, próximos; no mesmo dia, a ordem de chegada', () => {
  const it = [
    { id: 1, grupo: 'proximos' as const, previsto: '2026-11-26' },
    { id: 2, grupo: 'hoje' as const, previsto: '2026-11-24' },
    { id: 3, grupo: 'atrasados' as const, previsto: '2026-11-20' },
    { id: 9, grupo: 'hoje' as const, previsto: '2026-11-24' },
    { id: 4, grupo: 'atrasados' as const, previsto: '2026-11-18' },
  ]
  assert.deepEqual(ordenarFila(it).map((i) => i.id), [4, 3, 2, 9, 1])
})

test('WhatsApp: 55 na frente do número brasileiro; texto codificado; sem número, sem link', () => {
  assert.equal(linkWhatsApp('(11) 98765-4321', 'Oi Ana, tudo bem?'), 'https://wa.me/5511987654321?text=Oi%20Ana%2C%20tudo%20bem%3F')
  assert.equal(linkWhatsApp('+55 19 3333-4444'), 'https://wa.me/551933334444')
  assert.equal(linkWhatsApp('123'), null)
  assert.equal(linkWhatsApp(null, 'x'), null)
})
