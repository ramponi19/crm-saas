/**
 * FUNIL DE PARTIDA PELO PRESET (zero-segmento, 29/10/2026).
 *
 * Sem etapas no banco, o kanban cai no funil com que o preset nasce. A lista de
 * leads passava o valor normalizado (desconhecido virava 'varejo'); agora passa o
 * preset cru — os dois caminhos têm de dar o mesmo funil.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getKanbanColumns, KANBAN_COLUMNS } from '@/components/modules/leads/types'

test('imobiliária nasce com o funil próprio; o resto, com o padrão', () => {
  const imob = getKanbanColumns('imobiliaria')
  assert.equal(imob.length, 11)
  assert.equal(imob[0].label, 'Lead novo')
  for (const p of ['varejo', 'assistencia', 'concessionaria', 'nao-existe', '', null, undefined]) {
    assert.deepEqual(getKanbanColumns(p), KANBAN_COLUMNS, String(p))
  }
})
