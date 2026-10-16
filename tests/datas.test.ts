/**
 * lib/datas.ts precisa dar o MESMO texto no servidor (UTC na Vercel) e no
 * navegador (Brasília) — senão a página mostra o dia errado e o React acusa o
 * erro de hidratação #418 na troca. O teste troca o fuso do processo e confere.
 *
 *   npm test
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { formatarData, formatarDiaMes } from '@/lib/datas'

const original = process.env.TZ
afterEach(() => { process.env.TZ = original })

const FUSOS = ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']

describe('formatarData igual em qualquer fuso de processo', () => {
  for (const tz of FUSOS) {
    test(`data pura não perde um dia (processo em ${tz})`, () => {
      process.env.TZ = tz
      assert.equal(formatarData('2026-08-18'), '18/08/2026')
      assert.equal(formatarDiaMes('2026-08-18'), '18/08')
    })

    test(`timestamp depois das 21h sai no dia de Brasília (processo em ${tz})`, () => {
      process.env.TZ = tz
      // 01:30 UTC de 17/10 = 22:30 de 16/10 em Brasília
      assert.equal(formatarData('2026-10-17T01:30:00Z'), '16/10/2026')
      assert.equal(formatarData(new Date('2026-10-17T01:30:00Z')), '16/10/2026')
    })
  }

  test('vazio e inválido não viram "Invalid Date"', () => {
    assert.equal(formatarData(null, undefined, '—'), '—')
    assert.equal(formatarData('não é data', undefined, '—'), '—')
  })
})
