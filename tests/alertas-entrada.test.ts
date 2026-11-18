/**
 * Alerta de entrada parada (18/11/2026): 30 min sem gravar, só no horário de atendimento da empresa.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entradaParada, MINUTOS_PARADA } from '@/lib/alertas-entrada'

const SP = 'America/Sao_Paulo'
// Quarta-feira, 18/11/2026. 14:00 em Brasília = 17:00 UTC.
const quartaTarde = new Date('2026-11-18T17:00:00Z')
const minAntes = (d: Date, m: number) => new Date(d.getTime() - m * 60_000)

test('30 minutos pendente no horário: alerta; 29 minutos: ainda não', () => {
  assert.equal(MINUTOS_PARADA, 30)
  assert.equal(entradaParada(minAntes(quartaTarde, 30), quartaTarde, null, SP), true)
  assert.equal(entradaParada(minAntes(quartaTarde, 29), quartaTarde, null, SP), false)
})

test('fora do horário de atendimento não alerta (padrão seg–sex 9h–18h; horário da empresa vale)', () => {
  const quartaNoite = new Date('2026-11-18T23:30:00Z') // 20h30 em Brasília
  assert.equal(entradaParada(minAntes(quartaNoite, 120), quartaNoite, null, SP), false)
  const sabado = new Date('2026-11-21T14:00:00Z') // sábado 11h
  assert.equal(entradaParada(minAntes(sabado, 60), sabado, null, SP), false)
  // Loja que abre sábado (horário configurado): alerta.
  assert.equal(entradaParada(minAntes(sabado, 60), sabado, { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5, 6] }, SP), true)
})
