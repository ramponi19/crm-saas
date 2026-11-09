/**
 * Agendamento público no fuso da empresa (10/11/2026): os dias e horários saem iguais
 * no servidor (UTC) e no navegador, o horário ocupado é reconhecido qualquer que seja
 * o formato do texto, e a API só aceita um horário que a tela oferece.
 *
 *   npm test
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chavesOcupadas, diasDeAgenda, horarioOferecido, horariosDoDia, horarioDaAgenda } from '@/lib/agendar-slots'

const original = process.env.TZ
afterEach(() => { process.env.TZ = original })

const H = horarioDaAgenda({ inicio: '09:00', fim: '12:00', dias: [1, 2, 3, 4, 5] })
const SP = 'America/Sao_Paulo'

describe('agendamento público', () => {
  for (const tz of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
    test(`os horários de terça 10/11 são 09:00…11:30 de Brasília (processo em ${tz})`, () => {
      process.env.TZ = tz
      const s = horariosDoDia('2026-11-10', H, SP).map((d) => d.toISOString())
      assert.equal(s.length, 6)
      assert.equal(s[0], '2026-11-10T12:00:00.000Z')
      assert.equal(s[5], '2026-11-10T14:30:00.000Z')
    })

    test(`às 21h30 de segunda o 1º dia ainda é segunda; às 00h01 de sábado pula para segunda (processo em ${tz})`, () => {
      process.env.TZ = tz
      const segunda2130 = new Date('2026-11-09T21:30:00-03:00').getTime()
      assert.equal(diasDeAgenda(H, segunda2130, SP)[0], '2026-11-09')
      const sabado0001 = new Date('2026-11-14T00:01:00-03:00').getTime()
      assert.equal(diasDeAgenda(H, sabado0001, SP)[0], '2026-11-16')
    })
  }

  test('o ocupado do banco (`+00:00`) bate com o horário da tela (`.000Z`)', () => {
    const ocupadas = chavesOcupadas(['2026-11-10T12:30:00+00:00'])
    const slot = horariosDoDia('2026-11-10', H, SP)[1]
    assert.equal(slot.toISOString(), '2026-11-10T12:30:00.000Z')
    assert.ok(ocupadas.has(slot.getTime()))
    // O jeito antigo: comparar o texto nunca batia.
    assert.ok(!new Set(['2026-11-10T12:30:00+00:00']).has(slot.toISOString()))
  })

  test('a API só aceita horário oferecido', () => {
    assert.ok(horarioOferecido(new Date('2026-11-10T09:30:00-03:00'), H, SP))
    assert.ok(!horarioOferecido(new Date('2026-11-10T09:17:00-03:00'), H, SP), 'fora do passo de 30 min')
    assert.ok(!horarioOferecido(new Date('2026-11-10T12:00:00-03:00'), H, SP), 'no fim do expediente')
    assert.ok(!horarioOferecido(new Date('2026-11-15T10:00:00-03:00'), H, SP), 'domingo')
    // 09:30 de Manaus é 10:30 de Brasília: para uma loja em Manaus é horário oferecido.
    assert.ok(horarioOferecido(new Date('2026-11-10T09:30:00-04:00'), H, 'America/Manaus'))
  })
})
