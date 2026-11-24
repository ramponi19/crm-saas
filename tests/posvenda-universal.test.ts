import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chaveDoRotulo, descreverQuando, filtrosDoPasso, numeroPositivo, passoPrecisaDeModelo, PARAMETROS, validarCampoVenda, validarFiltrosCampos, validarPasso,
} from '@/lib/posvenda/config'
import { rotuloDoPasso } from '@/lib/posvenda/fila'
import { camposDaVenda, validarCamposDaVenda } from '@/lib/venda-campos'

// Pós-venda universal (24/11/2026, migração 2200): âncora, repetição, uso, filtros, categorias e campos da venda.

const base = { titulo: 'Revisão', ordem: 1, tipo_acao: 'ligacao' }

test('passo pela venda continua como antes: dia de 0 a 3650, sem repetição', () => {
  const r = validarPasso({ ...base, dia_offset: 30 })
  assert.ok(r.ok)
  assert.equal(r.v.ancora_tipo, 'venda')
  assert.equal(r.v.repetir_intervalo, null)
  assert.deepEqual(r.v.campos, [])
  assert.equal(validarPasso({ ...base, dia_offset: -1 }).ok, false)
})

test('data fixa no ano: dia e mês válidos; ajuste pode ser negativo', () => {
  const r = validarPasso({ ...base, ancora_tipo: 'data_fixa', ancora_mes_dia: '12-25', dia_offset: -5 })
  assert.ok(r.ok)
  assert.equal(r.v.ancora_mes_dia, '12-25')
  assert.equal(r.v.dia_offset, -5)
  assert.equal(validarPasso({ ...base, ancora_tipo: 'data_fixa', ancora_mes_dia: '13-01' }).ok, false)
  assert.equal(validarPasso({ ...base, ancora_tipo: 'data_fixa', ancora_mes_dia: '' }).ok, false)
})

test('data de campo: exige o campo; o ajuste vai de -365 a 3650', () => {
  assert.ok(validarPasso({ ...base, ancora_tipo: 'campo_data', ancora_campo: 'revisao_em', dia_offset: -7 }).ok)
  assert.equal(validarPasso({ ...base, ancora_tipo: 'campo_data', ancora_campo: '' }).ok, false)
  assert.equal(validarPasso({ ...base, ancora_tipo: 'campo_data', ancora_campo: 'revisao_em', dia_offset: -400 }).ok, false)
})

test('uso estimado: alvo e ritmo (padrão ou campo); repetição liga sem intervalo próprio', () => {
  const r = validarPasso({ ...base, ancora_tipo: 'uso', ancora_campo: 'km', uso_alvo: '10.000', uso_ritmo_padrao: '50', repetir: true })
  assert.ok(r.ok)
  assert.equal(r.v.uso_alvo, 10000)
  assert.equal(r.v.uso_ritmo_padrao, 50)
  assert.equal(r.v.repetir_intervalo, 1)
  assert.equal(r.v.repetir_unidade, 'dias')
  assert.ok(validarPasso({ ...base, ancora_tipo: 'uso', ancora_campo: 'km', uso_alvo: 5000, uso_ritmo_campo: 'km_dia' }).ok)
  assert.equal(validarPasso({ ...base, ancora_tipo: 'uso', ancora_campo: 'km', uso_alvo: 5000 }).ok, false, 'sem ritmo')
  assert.equal(validarPasso({ ...base, ancora_tipo: 'uso', ancora_campo: 'km', uso_ritmo_padrao: 50 }).ok, false, 'sem alvo')
})

test('repetição: intervalo, unidade e limite opcional (2 a 1000)', () => {
  const r = validarPasso({ ...base, dia_offset: 0, repetir: true, repetir_intervalo: 1, repetir_unidade: 'meses', repetir_max: '6' })
  assert.ok(r.ok)
  assert.deepEqual([r.v.repetir_intervalo, r.v.repetir_unidade, r.v.repetir_max], [1, 'meses', 6])
  assert.equal(validarPasso({ ...base, dia_offset: 0, repetir: true, repetir_intervalo: 1, repetir_unidade: 'anos' }).ok, false)
  assert.equal(validarPasso({ ...base, dia_offset: 0, repetir: true, repetir_intervalo: 1, repetir_unidade: 'dias', repetir_max: 1 }).ok, false)
  const sem = validarPasso({ ...base, dia_offset: 0, repetir: false, repetir_intervalo: 30, repetir_unidade: 'dias' })
  assert.ok(sem.ok)
  assert.equal(sem.v.repetir_intervalo, null, 'desmarcado não repete')
})

test('filtros por campo: operador conhecido, valor exigido (menos "preenchido"), maior/menor numéricos', () => {
  assert.deepEqual(validarFiltrosCampos([{ chave: 'cor', op: 'igual', valor: ' Azul ' }, { chave: 'placa', op: 'preenchido', valor: 'x' }]),
    [{ chave: 'cor', op: 'igual', valor: 'Azul' }, { chave: 'placa', op: 'preenchido', valor: '' }])
  assert.equal(typeof validarFiltrosCampos([{ chave: 'cor', op: 'igual', valor: '' }]), 'string')
  assert.equal(typeof validarFiltrosCampos([{ chave: 'km', op: 'maior', valor: 'muito' }]), 'string')
  assert.equal(typeof validarFiltrosCampos([{ chave: 'Cor!', op: 'igual', valor: 'a' }]), 'string')
  assert.deepEqual(filtrosDoPasso({ condicao: null, campos: [] }), {})
  assert.deepEqual(filtrosDoPasso({ condicao: 'usado', campos: [{ chave: 'cor', op: 'igual', valor: 'Azul' }] }),
    { condicao: 'usado', campos: [{ chave: 'cor', op: 'igual', valor: 'Azul' }] })
})

test('descrição do quando, em português', () => {
  assert.equal(descreverQuando({ dia_offset: 30 }), '30 dias depois da venda')
  assert.equal(descreverQuando({ dia_offset: 0, repetir_intervalo: 1, repetir_unidade: 'meses', repetir_max: 6 }), 'No dia da venda, repete a cada 1 mês (até 6 vezes)')
  assert.equal(descreverQuando({ dia_offset: -5, ancora_tipo: 'data_fixa', ancora_mes_dia: '12-25', repetir_intervalo: 12, repetir_unidade: 'meses' }),
    'Todo 25 de dez (5 dias antes)')
  assert.equal(descreverQuando({ dia_offset: 0, ancora_tipo: 'data_fixa', ancora_mes_dia: '12-25' }), 'No próximo 25 de dez depois da venda')
  assert.equal(descreverQuando({ dia_offset: -7, ancora_tipo: 'campo_data', ancora_campo: 'revisao_em' }, { revisao_em: 'Próxima revisão' }),
    'Na data de “Próxima revisão” (7 dias antes)')
  assert.equal(descreverQuando({ dia_offset: 0, ancora_tipo: 'uso', ancora_campo: 'km', uso_alvo: 10000, uso_ritmo_padrao: 50, repetir_intervalo: 1 }, { km: 'Quilometragem' }),
    'Quando “Quilometragem” chegar a +10.000 (50 por dia), repete a cada +10.000')
})

test('passo fora da venda pede modelo (a janela de 24 h estará fechada)', () => {
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'whatsapp', dia_offset: 0, modelo_id: null, ancora_tipo: 'data_fixa' }), true)
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'whatsapp', dia_offset: 0, modelo_id: null, ancora_tipo: 'venda' }), false)
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'ligacao', dia_offset: 0, modelo_id: null, ancora_tipo: 'uso' }), false)
})

test('rótulo na fila: D+ só para o passo pela venda na 1ª vez', () => {
  assert.equal(rotuloDoPasso(30, 'Acessórios'), 'D+30 Acessórios')
  assert.equal(rotuloDoPasso(0, 'Aniversário', { ancora: 'campo_data' }), 'Aniversário')
  assert.equal(rotuloDoPasso(0, 'Mensal', { ancora: 'venda', ocorrencia: 3 }), 'Mensal · 3ª vez')
})

test('origem das categorias: estoque (padrão) ou próprias', () => {
  assert.equal(PARAMETROS.categorias_fonte.padrao, 'estoque')
  assert.equal(PARAMETROS.categorias_fonte.validar('proprias'), 'proprias')
  assert.equal(PARAMETROS.categorias_fonte.validar('outra'), undefined)
})

test('campo da venda: chave pelo nome, tipo conhecido, lista com 2 opções ou mais', () => {
  assert.equal(chaveDoRotulo('Quilometragem atual'), 'quilometragem_atual')
  assert.equal(chaveDoRotulo('Próxima revisão'), 'proxima_revisao')
  assert.equal(chaveDoRotulo('2º dono'), 'campo_2_dono')
  const r = validarCampoVenda({ rotulo: 'Placa', tipo: 'texto', obrigatorio: true })
  assert.ok(r.ok)
  assert.deepEqual([r.v.chave, r.v.obrigatorio], ['placa', true])
  assert.equal(validarCampoVenda({ rotulo: 'Combustível', tipo: 'opcao', opcoes: ['Flex'] }).ok, false)
  assert.equal(validarCampoVenda({ rotulo: 'Venda', tipo: 'texto' }).ok, false, 'chave reservada')
  assert.equal(validarCampoVenda({ rotulo: 'X', tipo: 'texto' }).ok, false)
})

test('número digitado: milhar com ponto, decimal com vírgula ou ponto', () => {
  assert.equal(numeroPositivo('10.000'), 10000)
  assert.equal(numeroPositivo('12,5'), 12.5)
  assert.equal(numeroPositivo('12.5'), 12.5)
  assert.equal(numeroPositivo('1.234,5'), 1234.5)
  assert.equal(numeroPositivo('0'), null)
  assert.equal(numeroPositivo('abc'), null)
})

test('campos no modal de venda: obrigatório, tipo e opção conferidos; vazio opcional não grava', () => {
  const campos = camposDaVenda([
    { chave: 'placa', rotulo: 'Placa', tipo: 'texto', opcoes: [], obrigatorio: true },
    { chave: 'km', rotulo: 'Quilometragem', tipo: 'numero', opcoes: [], obrigatorio: false },
    { chave: 'revisao_em', rotulo: 'Próxima revisão', tipo: 'data', opcoes: [], obrigatorio: false },
    { chave: 'combustivel', rotulo: 'Combustível', tipo: 'opcao', opcoes: ['Flex', 'Diesel'], obrigatorio: false },
    { lixo: true },
  ])
  assert.equal(campos.length, 4)
  assert.deepEqual(validarCamposDaVenda(campos, {}), { ok: false, campo: 'placa', erro: 'Informe placa.' })
  assert.deepEqual(validarCamposDaVenda(campos, { placa: 'ABC1D23', km: '12.500', revisao_em: '', combustivel: 'Flex' }),
    { ok: true, valores: { placa: 'ABC1D23', km: 12500, combustivel: 'Flex' } })
  assert.equal(validarCamposDaVenda(campos, { placa: 'A', km: 'muito' }).ok, false)
  assert.equal(validarCamposDaVenda(campos, { placa: 'A', revisao_em: '31/12/2026' }).ok, false)
  assert.equal(validarCamposDaVenda(campos, { placa: 'A', combustivel: 'Gasolina' }).ok, false)
  assert.deepEqual(validarCamposDaVenda([], { qualquer: 1 }), { ok: true, valores: {} })
})
