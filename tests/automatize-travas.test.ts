import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HORARIO_PADRAO, agendarPara, dentroDoHorario, horarioValido, modeloRecente, proximoHorario, tetoAtingido, TETO_POR_HORA,
} from '@/lib/automatize/travas'

// Instantes em UTC; São Paulo = UTC-3.
const sp = (iso: string) => new Date(`${iso}-03:00`)

test('horário padrão: seg–sex 9h–18h em São Paulo', () => {
  assert.equal(dentroDoHorario(sp('2026-11-04T10:00:00'), HORARIO_PADRAO), true)   // quarta 10h
  assert.equal(dentroDoHorario(sp('2026-11-04T08:59:00'), HORARIO_PADRAO), false)  // antes
  assert.equal(dentroDoHorario(sp('2026-11-04T18:00:00'), HORARIO_PADRAO), false)  // fim é aberto
  assert.equal(dentroDoHorario(sp('2026-11-07T10:00:00'), HORARIO_PADRAO), false)  // sábado
})

test('fora do horário: vai para o próximo início', () => {
  assert.equal(proximoHorario(sp('2026-11-04T20:00:00'), HORARIO_PADRAO).toISOString(), sp('2026-11-05T09:00:00').toISOString()) // qua 20h → qui 9h
  assert.equal(proximoHorario(sp('2026-11-04T07:30:00'), HORARIO_PADRAO).toISOString(), sp('2026-11-04T09:00:00').toISOString()) // mesmo dia
  assert.equal(proximoHorario(sp('2026-11-06T19:00:00'), HORARIO_PADRAO).toISOString(), sp('2026-11-09T09:00:00').toISOString()) // sex 19h → seg 9h
  const dentro = sp('2026-11-04T11:11:00')
  assert.equal(proximoHorario(dentro, HORARIO_PADRAO).getTime(), dentro.getTime())
})

test('horário da empresa com sábado; lixo cai no padrão', () => {
  const h = horarioValido({ inicio: '08:00', fim: '12:00', dias: [6], sla_resposta_min: 15 })
  assert.equal(dentroDoHorario(sp('2026-11-07T09:00:00'), h), true)
  assert.equal(proximoHorario(sp('2026-11-07T13:00:00'), h).toISOString(), sp('2026-11-14T08:00:00').toISOString())
  assert.deepEqual(horarioValido(null), HORARIO_PADRAO)
  assert.deepEqual(horarioValido({ inicio: '18:00', fim: '09:00', dias: [1] }), HORARIO_PADRAO)
  assert.deepEqual(horarioValido({ inicio: '09:00', fim: '18:00', dias: [] }), HORARIO_PADRAO)
})

test('1 envio do mesmo modelo por contato a cada 7 dias', () => {
  const agora = sp('2026-11-04T10:00:00')
  assert.equal(modeloRecente(null, agora), false)
  assert.equal(modeloRecente(sp('2026-10-29T10:00:01'), agora), true)   // 6 dias e 23h59
  assert.equal(modeloRecente(sp('2026-10-28T10:00:00'), agora), false)  // 7 dias exatos
})

test('teto de 50 por hora; esperar N dias', () => {
  assert.equal(tetoAtingido(TETO_POR_HORA - 1), false)
  assert.equal(tetoAtingido(TETO_POR_HORA), true)
  const t0 = sp('2026-11-04T10:00:00')
  assert.equal(agendarPara(t0, 0).getTime(), t0.getTime())
  assert.equal(agendarPara(t0, 3).getTime() - t0.getTime(), 3 * 86_400_000)
  assert.equal(agendarPara(t0, 999).getTime() - t0.getTime(), 90 * 86_400_000)
})
