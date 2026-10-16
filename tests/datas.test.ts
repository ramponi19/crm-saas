/**
 * lib/datas.ts precisa dar o MESMO texto no servidor (UTC na Vercel) e no
 * navegador (Brasília) — senão a página mostra o dia errado e o React acusa o
 * erro de hidratação #418 na troca. O teste troca o fuso do processo e confere.
 *
 *   npm test
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatarData, formatarDiaMes, formatarHora, formatarDataHora,
  diaSP, mesSP, meiaNoiteSP, inicioMesSP, inicioAnoSP,
} from '@/lib/datas'

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
    assert.equal(formatarHora(null, '—'), '—')
  })
})

/**
 * Os limites de período (hoje, início do mês, do ano) e as chaves de dia/mês
 * precisam sair no calendário de Brasília mesmo com o processo em UTC — que é
 * como o servidor da Vercel roda. O instante escolhido, 22:30 de 31/10 em
 * Brasília, já é 1º/11 em UTC: é exatamente onde o cálculo ingênuo erra.
 */
describe('dia e mês da loja em qualquer fuso de processo', () => {
  const NOITE_31_10 = new Date('2026-11-01T01:30:00Z') // 31/10 22:30 em Brasília

  for (const tz of FUSOS) {
    test(`chaves e limites no calendário de Brasília (processo em ${tz})`, () => {
      process.env.TZ = tz
      assert.equal(diaSP(NOITE_31_10), '2026-10-31')
      assert.equal(mesSP(NOITE_31_10), '2026-10')
      assert.equal(meiaNoiteSP(NOITE_31_10).toISOString(), '2026-10-31T03:00:00.000Z')
      assert.equal(meiaNoiteSP(NOITE_31_10, 1).toISOString(), '2026-11-01T03:00:00.000Z')
      assert.equal(meiaNoiteSP('2026-10-31', -30).toISOString(), '2026-10-01T03:00:00.000Z')
      assert.equal(inicioMesSP(NOITE_31_10).toISOString(), '2026-10-01T03:00:00.000Z')
      assert.equal(inicioMesSP(NOITE_31_10, 1).toISOString(), '2026-11-01T03:00:00.000Z')
      assert.equal(inicioMesSP(NOITE_31_10, -12).toISOString(), '2025-10-01T03:00:00.000Z')
      assert.equal(inicioAnoSP(NOITE_31_10).toISOString(), '2026-01-01T03:00:00.000Z')
    })

    test(`hora no fuso da loja (processo em ${tz})`, () => {
      process.env.TZ = tz
      assert.equal(formatarHora(NOITE_31_10), '22:30')
      assert.equal(formatarDataHora(NOITE_31_10), '31/10/2026, 22:30')
    })
  }

  test('virada de ano: 31/12 às 23h ainda é o ano velho', () => {
    process.env.TZ = 'UTC'
    const d = new Date('2027-01-01T02:00:00Z') // 31/12/2026 23:00 em Brasília
    assert.equal(inicioAnoSP(d).toISOString(), '2026-01-01T03:00:00.000Z')
    assert.equal(inicioMesSP(d).toISOString(), '2026-12-01T03:00:00.000Z')
  })
})
