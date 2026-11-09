/**
 * lib/datas.ts: o mesmo resultado no servidor (UTC na Vercel), no navegador
 * (Brasília) e em qualquer outro fuso de processo — e cortes de dia, semana, mês e
 * ano no fuso da EMPRESA, inclusive nos horários de virada (20h59, 21h01, 23h59 e
 * 00h01 de Brasília) e na virada de mês.
 *
 *   npm test
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatarData, formatarDiaMes, formatarHora, formatarDataHora, diaNoFuso, mesNoFuso,
  inicioDoDia, fimDoDia, inicioDoMes, fimDoMes, inicioDoAno, inicioDaSemana, instanteLocal,
  periodo, limitesDosDias, limitesDoMes, somarDias, primeiroDoMes, diasEntre, paraData,
  mesmoInstante, chaveDoInstante, fusoOuPadrao, fusoValido, partesNoFuso, rotuloDoMes,
} from '@/lib/datas'

const original = process.env.TZ
afterEach(() => { process.env.TZ = original })

const FUSOS_DE_PROCESSO = ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']
/** Instante a partir do relógio de Brasília (UTC−3, sem horário de verão). */
const sp = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`)
const iso = (d: Date) => d.toISOString()

describe('formatarData igual em qualquer fuso de processo', () => {
  for (const tz of FUSOS_DE_PROCESSO) {
    test(`data pura não perde um dia (processo em ${tz})`, () => {
      process.env.TZ = tz
      assert.equal(formatarData('2026-08-18'), '18/08/2026')
      assert.equal(formatarDiaMes('2026-08-18'), '18/08')
      assert.equal(diaNoFuso(paraData('2026-08-18')!), '2026-08-18')
    })

    test(`timestamp depois das 21h sai no dia de Brasília (processo em ${tz})`, () => {
      process.env.TZ = tz
      // 01:30 UTC de 17/10 = 22:30 de 16/10 em Brasília
      assert.equal(formatarData('2026-10-17T01:30:00Z'), '16/10/2026')
      assert.equal(formatarData(new Date('2026-10-17T01:30:00Z')), '16/10/2026')
      assert.equal(formatarHora('2026-10-17T01:30:00Z'), '22:30')
      assert.equal(formatarDataHora('2026-10-17T01:30:00+00:00'), '16/10/2026, 22:30')
    })

    test(`a hora sai no fuso da empresa pedida (processo em ${tz})`, () => {
      process.env.TZ = tz
      assert.equal(formatarHora('2026-11-10T17:00:00Z'), '14:00')
      assert.equal(formatarHora('2026-11-10T17:00:00Z', '', 'America/Manaus'), '13:00')
      assert.equal(formatarHora('2026-08-18'), '', 'data pura não tem hora')
    })
  }

  test('vazio e inválido não viram "Invalid Date"', () => {
    assert.equal(formatarData(null, undefined, '—'), '—')
    assert.equal(formatarData('não é data', undefined, '—'), '—')
    assert.equal(formatarHora(undefined, '—'), '—')
  })
})

describe('cortes de dia nos horários de virada (Brasília)', () => {
  for (const tz of FUSOS_DE_PROCESSO) {
    test(`20h59, 21h01, 23h59 e 00h01 ficam no dia certo (processo em ${tz})`, () => {
      process.env.TZ = tz
      for (const hhmm of ['20:59', '21:01', '23:59']) {
        const d = sp('2026-11-10', hhmm)
        assert.equal(diaNoFuso(d), '2026-11-10', hhmm)
        assert.equal(iso(inicioDoDia(d)), '2026-11-10T03:00:00.000Z', `${hhmm} início`)
        assert.equal(iso(fimDoDia(d)), '2026-11-11T03:00:00.000Z', `${hhmm} fim`)
      }
      const madrugada = sp('2026-11-11', '00:01')
      assert.equal(diaNoFuso(madrugada), '2026-11-11')
      assert.equal(iso(inicioDoDia(madrugada)), '2026-11-11T03:00:00.000Z')
    })

    test(`KPI "Hoje" às 21h30 não inclui ontem nem zera (processo em ${tz})`, () => {
      process.env.TZ = tz
      const { de, ate } = periodo('hoje', sp('2026-11-10', '21:30'))
      const venda09h = sp('2026-11-10', '09:00'), venda2130 = sp('2026-11-10', '21:15'), ontem22h = sp('2026-11-09', '22:00')
      const dentro = (v: Date) => v >= de && v < ate
      assert.ok(dentro(venda09h) && dentro(venda2130), 'as vendas de hoje entram')
      assert.ok(!dentro(ontem22h), 'a de ontem às 22h não entra')
    })
  }

  test('7d e 30d contam o dia de hoje inteiro e os anteriores inteiros', () => {
    const agora = sp('2026-11-10', '21:30')
    assert.equal(iso(periodo('7d', agora).de), iso(sp('2026-11-04', '00:00')))
    assert.equal(iso(periodo('30d', agora).de), iso(sp('2026-10-12', '00:00')))
    assert.equal(iso(periodo('7d', agora).ate), iso(sp('2026-11-11', '00:00')))
    assert.equal(iso(periodo('ontem', agora).de), iso(sp('2026-11-09', '00:00')))
  })

  test('semana começa na segunda-feira', () => {
    // 10/11/2026 é terça; às 23h59 continua na semana que começou em 09/11
    assert.equal(iso(inicioDaSemana(sp('2026-11-10', '23:59'))), iso(sp('2026-11-09', '00:00')))
    // domingo 15/11 ainda é da semana de 09/11
    assert.equal(iso(inicioDaSemana(sp('2026-11-15', '22:00'))), iso(sp('2026-11-09', '00:00')))
  })
})

describe('virada de mês e de ano (Brasília)', () => {
  for (const tz of FUSOS_DE_PROCESSO) {
    test(`30/11 às 21h01 ainda é novembro; 01/12 às 00h01 já é dezembro (processo em ${tz})`, () => {
      process.env.TZ = tz
      const fimNov = sp('2026-11-30', '21:01')
      assert.equal(mesNoFuso(fimNov), '2026-11')
      assert.equal(iso(inicioDoMes(fimNov)), iso(sp('2026-11-01', '00:00')))
      assert.equal(iso(fimDoMes(fimNov)), iso(sp('2026-12-01', '00:00')))
      assert.equal(mesNoFuso(sp('2026-11-30', '23:59')), '2026-11')
      assert.equal(mesNoFuso(sp('2026-12-01', '00:01')), '2026-12')
      assert.equal(iso(periodo('mes_anterior', sp('2026-12-01', '00:01')).de), iso(sp('2026-11-01', '00:00')))
    })

    test(`31/12 às 22h ainda é o ano velho (processo em ${tz})`, () => {
      process.env.TZ = tz
      assert.equal(iso(inicioDoAno(sp('2026-12-31', '22:00'))), iso(sp('2026-01-01', '00:00')))
      assert.equal(iso(inicioDoAno(sp('2027-01-01', '00:01'))), iso(sp('2027-01-01', '00:00')))
    })
  }

  test('venda das 21h às 24h do último dia conta no mês dela', () => {
    const nov = limitesDoMes('2026-11')
    const venda = sp('2026-11-30', '22:40')
    assert.ok(venda >= nov.de && venda < nov.ate)
    const dez = limitesDoMes('2026-12')
    assert.ok(!(venda >= dez.de && venda < dez.ate))
  })
})

describe('fuso de outra empresa e conversões', () => {
  test('Manaus (UTC−4): o dia começa às 04:00 UTC', () => {
    const d = new Date('2026-11-11T03:30:00Z') // 23:30 de 10/11 em Manaus, 00:30 de 11/11 em Brasília
    assert.equal(diaNoFuso(d, 'America/Manaus'), '2026-11-10')
    assert.equal(diaNoFuso(d, 'America/Sao_Paulo'), '2026-11-11')
    assert.equal(iso(inicioDoDia(d, 'America/Manaus')), '2026-11-10T04:00:00.000Z')
  })

  test('fuso com horário de verão (Nova York) converge nas duas trocas', () => {
    assert.equal(iso(instanteLocal('2026-03-08', '03:30', 'America/New_York')), '2026-03-08T07:30:00.000Z')
    assert.equal(iso(instanteLocal('2026-11-01', '12:00', 'America/New_York')), '2026-11-01T17:00:00.000Z')
    assert.equal(iso(instanteLocal('2026-07-01', '00:00', 'America/New_York')), '2026-07-01T04:00:00.000Z')
  })

  test('fuso desconhecido cai no padrão', () => {
    assert.equal(fusoOuPadrao('Marte/Base'), 'America/Sao_Paulo')
    assert.equal(fusoOuPadrao(null), 'America/Sao_Paulo')
    assert.ok(fusoValido('America/Manaus'))
    assert.ok(!fusoValido(''))
    assert.equal(diaNoFuso(sp('2026-11-10', '22:00'), 'Marte/Base'), '2026-11-10')
  })

  test('limites de dias do filtro: "até 31/08" inclui o dia 31 inteiro', () => {
    const { de, ate } = limitesDosDias('2026-08-01', '2026-08-31')
    assert.equal(iso(de), iso(sp('2026-08-01', '00:00')))
    assert.equal(iso(ate), iso(sp('2026-09-01', '00:00')))
  })

  test('aritmética de calendário', () => {
    assert.equal(somarDias('2026-11-30', 1), '2026-12-01')
    assert.equal(somarDias('2026-03-01', -1), '2026-02-28')
    assert.equal(primeiroDoMes('2026-01-15', -1), '2025-12-01')
    assert.equal(diasEntre('2026-11-01', '2026-12-01'), 30)
    assert.deepEqual(partesNoFuso(sp('2026-11-10', '21:05')), { ano: 2026, mes: 11, dia: 10, hora: 21, minuto: 5, segundo: 0, diaSemana: 2 })
    assert.equal(rotuloDoMes('2026-11'), 'novembro de 2026')
  })

  test('o mesmo instante em formatos diferentes do banco e do navegador', () => {
    assert.ok(mesmoInstante('2026-11-10T13:00:00+00:00', '2026-11-10T13:00:00.000Z'))
    assert.ok(mesmoInstante('2026-11-10T10:00:00-03:00', new Date('2026-11-10T13:00:00Z')))
    assert.equal(chaveDoInstante('2026-11-10T13:00:00+00:00'), chaveDoInstante('2026-11-10T13:00:00.000Z'))
    assert.ok(!mesmoInstante('2026-11-10T13:00:00Z', '2026-11-10T13:30:00Z'))
  })
})
