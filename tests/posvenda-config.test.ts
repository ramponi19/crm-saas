import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriasPermitidas, passoPrecisaDeModelo, PARAMETROS, validarPasso, validarRegua } from '@/lib/posvenda/config'

// C7 bloco 3 (24/11/2026): as regras puras de Configurações › Pós-venda.

test('categorias de modelo: sem a chave, só Utilidade; a empresa libera Marketing; valor estranho cai no padrão', () => {
  assert.deepEqual(categoriasPermitidas(null), ['UTILITY'])
  assert.deepEqual(categoriasPermitidas(['UTILITY', 'MARKETING']), ['UTILITY', 'MARKETING'])
  assert.deepEqual(categoriasPermitidas(['MARKETING']), ['MARKETING'])
  assert.deepEqual(categoriasPermitidas(['AUTHENTICATION', 'x']), ['UTILITY'])
  assert.equal(PARAMETROS.categorias_modelo.validar([]), undefined)
  assert.deepEqual(PARAMETROS.categorias_modelo.validar(['MARKETING', 'MARKETING']), ['MARKETING'])
})

test('aviso de passo sem modelo: WhatsApp ou pesquisa a partir de D+3, ligado e sem modelo', () => {
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'whatsapp', dia_offset: 7, modelo_id: null }), true)
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'pesquisa', dia_offset: 3, modelo_id: null }), true)
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'whatsapp', dia_offset: 2, modelo_id: null }), false)
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'whatsapp', dia_offset: 30, modelo_id: 4 }), false)
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'ligacao', dia_offset: 30, modelo_id: null }), false)
  assert.equal(passoPrecisaDeModelo({ tipo_acao: 'whatsapp', dia_offset: 30, modelo_id: null, ativo: false }), false)
})

test('régua: nome, prioridade, categorias sem repetição, condição e o que fazer na recompra', () => {
  const r = validarRegua({ nome: '  iPhone  ', prioridade: '100', categorias: [1, '2', 2, 'x'], condicao: 'seminovo' })
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.v, { nome: 'iPhone', ativo: true, prioridade: 100, categorias: [1, 2], condicao: 'seminovo', ao_recomprar: 'reiniciar' })
  assert.equal(validarRegua({ nome: 'x' }).ok, false)
  assert.equal(validarRegua({ nome: 'Geral', ao_recomprar: 'sumir' }).ok, false)
})

test('passo: dia, tipo, título, roteiro, responsável e modelo', () => {
  const p = validarPasso({ ordem: 2, dia_offset: '7', tipo_acao: 'pesquisa', titulo: 'Experiência', roteiro: 'Oi {{nome}}', modelo_id: '12', condicao: 'novo' })
  assert.ok(p.ok)
  if (p.ok) {
    assert.equal(p.v.dia_offset, 7); assert.equal(p.v.modelo_id, 12); assert.equal(p.v.responsavel, 'acompanhamento')
    assert.equal(p.v.grupo, 'relacionamento'); assert.equal(p.v.tolerancia_dias, 7); assert.equal(p.v.condicao, 'novo')
  }
  assert.equal(validarPasso({ ordem: 1, dia_offset: 1, tipo_acao: 'sms', titulo: 'Oi' }).ok, false)
  assert.equal(validarPasso({ ordem: 1, dia_offset: -1, tipo_acao: 'whatsapp', titulo: 'Oi' }).ok, false)
  assert.equal(validarPasso({ ordem: 1, dia_offset: 1, tipo_acao: 'whatsapp', titulo: 'Oi', responsavel: 'qualquer' }).ok, false)
  assert.equal(validarPasso({ ordem: 1, dia_offset: 1, tipo_acao: 'whatsapp', titulo: 'Oi', modelo_id: 'abc' }).ok, false)
})

test('parâmetros: limites de cada um', () => {
  assert.equal(PARAMETROS.teto_diario.validar(0), undefined)
  assert.equal(PARAMETROS.teto_diario.validar('25'), 25)
  assert.equal(PARAMETROS.sla_horas.validar('corridas'), 'corridas')
  assert.equal(PARAMETROS.sla_horas.validar('uteis'), undefined)
  assert.equal(PARAMETROS.nps_limite_chamado.validar(11), undefined)
  assert.equal(PARAMETROS.responsavel_padrao.validar('nao-e-uuid'), undefined)
})
