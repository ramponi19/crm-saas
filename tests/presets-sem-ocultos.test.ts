/**
 * OCULTAR É SÓ DE empresa_menu (decisão do Lucas, 03/11/2026).
 *
 * O preset carregava `hidden_hrefs`, que nada aplicava desde 21/10: o de veículos
 * escondia /pdv e /compras e ao mesmo tempo os ligava. O conceito saiu do preset,
 * da migração 20261029000100 e da tela de presets; quem oculta é o superadmin e o
 * dono, nas camadas deles em empresa_menu.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRESETS } from './presets-da-migracao'
import { editavelDoPreset, presetDoEditavel, baseDoPreset } from '@/lib/presets'

test('nenhum preset da migração carrega ocultos', () => {
  assert.equal(Object.keys(PRESETS).length, 7)
  for (const [chave, p] of Object.entries(PRESETS)) {
    const menu = (p.rotulos._menu ?? {}) as Record<string, unknown>
    assert.ok(!('hidden_hrefs' in menu), `${chave} ainda tem hidden_hrefs`)
  }
})

test('loja de veículos nasce com PDV e Compras ligados', () => {
  const base = baseDoPreset(PRESETS.concessionaria.rotulos)
  assert.ok(base.habilitados?.includes('/pdv'))
  assert.ok(base.habilitados?.includes('/compras'))
})

test('salvar um preset pela tela não grava ocultos de volta', () => {
  const linha = { chave: 'x', nome: 'X', descricao: null, ativo: true,
    rotulos: { '/leads': 'Pipeline', _menu: { hidden_hrefs: ['/pdv'], modulos_habilitados: ['/pdv'], ordem: 3 } } }
  const editavel = editavelDoPreset(linha)
  assert.ok(!('hidden_hrefs' in editavel))
  const gravado = presetDoEditavel(editavel).rotulos._menu as Record<string, unknown>
  assert.ok(!('hidden_hrefs' in gravado))
  assert.deepEqual(gravado.modulos_habilitados, ['/pdv'])
})
