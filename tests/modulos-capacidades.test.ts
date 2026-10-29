/**
 * O QUE CADA MÓDULO LIGA NAS TELAS DOS OUTROS (29/10/2026).
 *
 * Capacidades e painéis do card do lead saíram do molde por vertical e passaram
 * ao manifesto: a empresa tem o que os módulos ligados dela trazem. Os valores
 * abaixo são os que imobiliária, loja de veículos e restaurante tinham no molde
 * (menos placa, clínica e tela inicial, que viraram campo e rótulo).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacidadesDosModulos, paineisDosModulos } from '@/core/modulos'

test('Imóveis traz visitas, telas próprias, portais, comissão, captação, cliente com funil e os painéis', () => {
  const ligados = new Set(['/dashboard', '/leads', '/imoveis', '/agenda'])
  assert.deepEqual(capacidadesDosModulos(ligados), {
    agendaVisitas: true, telasProprias: true, integraPortais: true, comissaoPorNegocio: true,
    captacaoDeImovel: true, clienteComPipeline: true,
  })
  assert.deepEqual(paineisDosModulos(ligados), ['negocio-imovel', 'match-imoveis'])
})

test('Avaliação de veículos traz o bloco das automações, o match e os painéis de veículo', () => {
  const ligados = new Set(['/avaliacoes', '/consulta-fipe', '/simular-financiamento'])
  assert.deepEqual(capacidadesDosModulos(ligados), { automacoesVeiculo: true, matchVeiculo: true })
  assert.deepEqual(paineisDosModulos(ligados), ['interesse-veiculo', 'financiamento'])
})

test('Cardápio traz a comanda no PDV', () => {
  assert.deepEqual(capacidadesDosModulos(new Set(['/pdv', '/cardapio'])), { usaComanda: true })
  assert.deepEqual(paineisDosModulos(new Set(['/cardapio'])), [])
})

test('sem módulo de vertical ligado, nada a mais', () => {
  const varejo = new Set(['/dashboard', '/leads', '/pdv', '/estoque', '/catalogo', '/agenda'])
  assert.deepEqual(capacidadesDosModulos(varejo), {})
  assert.deepEqual(paineisDosModulos(varejo), [])
})
