/**
 * Horário de funcionamento por dia e por loja (lib/horario.ts, 24/11/2026). Universal.
 *
 * Duas empresas de exemplo, como pedido no ritual:
 *   - "horário único": só o formato antigo `horario_comercial` (seg–sex 9h–18h) — tudo igual a hoje;
 *   - "sábado reduzido": `core.horario` com seg–sex 9h–18h, sábado 9h–13h, domingo fechado, e uma loja com
 *     horário próprio (domingo 10h–14h).
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  HORARIO_PADRAO, abertoAgora, abreNoDia, doFormatoAntigo, horarioDaLoja, horarioValido, horasDoDia, horasReferencia,
  noDiaAberto, paraFormatoAntigo, proximaAbertura, proximoDiaAberto, temHorarioProprio, tetoDoDia,
} from '@/lib/horario'

const FUSO = 'America/Sao_Paulo'
const ANTIGO = { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5], sla_resposta_min: 15 }
const semana = (sab: { abre: string; fecha: string }[], dom: { abre: string; fecha: string }[] = []) => ({
  '0': dom, '1': [{ abre: '09:00', fecha: '18:00' }], '2': [{ abre: '09:00', fecha: '18:00' }], '3': [{ abre: '09:00', fecha: '18:00' }],
  '4': [{ abre: '09:00', fecha: '18:00' }], '5': [{ abre: '09:00', fecha: '18:00' }], '6': sab,
})
const NOVO = {
  empresa: { semana: semana([{ abre: '09:00', fecha: '13:00' }]), sla_resposta_min: 10 },
  lojas: { '6': { semana: semana([{ abre: '09:00', fecha: '13:00' }], [{ abre: '10:00', fecha: '14:00' }]) } },
}
// 2026-11-27 sexta, 28 sábado, 29 domingo, 30 segunda
const SEX = '2026-11-27', SAB = '2026-11-28', DOM = '2026-11-29', SEG = '2026-11-30'

describe('empresa com horário único (formato antigo): igual a hoje', () => {
  const h = horarioDaLoja(null, ANTIGO, 3)
  test('converte o antigo: seg–sex abertos, fim de semana fechado', () => {
    assert.equal(abreNoDia(h, SEX), true); assert.equal(abreNoDia(h, SAB), false); assert.equal(abreNoDia(h, DOM), false)
    assert.equal(horasDoDia(h, SEX), 9); assert.equal(h.sla_resposta_min, 15)
  })
  test('dia útil seguinte de sexta é segunda', () => assert.equal(proximoDiaAberto(h, SEX), SEG))
  test('teto: dia cheio 25, fim de semana 0', () => { assert.equal(tetoDoDia(25, h, SEX), 25); assert.equal(tetoDoDia(25, h, SAB), 0) })
  test('sem nada configurado vale o padrão de sempre (seg–sex 9h–18h)', () => {
    assert.deepEqual(horarioDaLoja(null, null, null), HORARIO_PADRAO)
    assert.deepEqual(paraFormatoAntigo(horarioDaLoja(null, null)), { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5] })
  })
  test('ida e volta: o antigo derivado do convertido é o mesmo', () => {
    assert.deepEqual(paraFormatoAntigo(doFormatoAntigo(ANTIGO)!), ANTIGO)
  })
})

describe('empresa com sábado reduzido e loja com horário próprio', () => {
  const emp = horarioDaLoja(NOVO, ANTIGO, 3) // a loja 3 não tem próprio: usa o da empresa (o novo vence o antigo)
  const loja6 = horarioDaLoja(NOVO, ANTIGO, 6)
  test('sábado abre 4h, domingo fechado; a loja 6 abre domingo', () => {
    assert.equal(abreNoDia(emp, SAB), true); assert.equal(horasDoDia(emp, SAB), 4); assert.equal(abreNoDia(emp, DOM), false)
    assert.equal(abreNoDia(loja6, DOM), true); assert.equal(temHorarioProprio(NOVO, 6), true); assert.equal(temHorarioProprio(NOVO, 3), false)
  })
  test('dia útil seguinte de sexta é sábado; de sábado é segunda (loja 6: domingo)', () => {
    assert.equal(proximoDiaAberto(emp, SEX), SAB); assert.equal(proximoDiaAberto(emp, SAB), SEG)
    assert.equal(proximoDiaAberto(loja6, SAB), DOM)
  })
  test('passo que cai no domingo vai para segunda', () => { assert.equal(noDiaAberto(emp, DOM), SEG); assert.equal(noDiaAberto(emp, SAB), SAB) })
  test('teto proporcional: 25 → 11 no sábado (4h de 9h); 30 → 13', () => {
    assert.equal(horasReferencia(emp), 9); assert.equal(tetoDoDia(25, emp, SAB), 11); assert.equal(tetoDoDia(30, emp, SAB), 13)
    assert.equal(tetoDoDia(25, emp, SEX), 25); assert.equal(tetoDoDia(25, emp, DOM), 0)
  })
  test('sábado 13h05 está fechado e a próxima abertura é segunda 9h', () => {
    const t = new Date('2026-11-28T16:05:00Z') // 13h05 em Brasília
    assert.equal(abertoAgora(t, emp, FUSO), false)
    assert.equal(proximaAbertura(t, emp, FUSO).toISOString(), '2026-11-30T12:00:00.000Z')
  })
  test('sábado 10h está aberto; sexta 18h30 abre sábado 9h', () => {
    assert.equal(abertoAgora(new Date('2026-11-28T13:00:00Z'), emp, FUSO), true)
    assert.equal(proximaAbertura(new Date('2026-11-27T21:30:00Z'), emp, FUSO).toISOString(), '2026-11-28T12:00:00.000Z')
  })
  test('formato antigo derivado (para quem ainda lê horario_comercial): dias com o sábado, horário da semana', () => {
    assert.deepEqual(paraFormatoAntigo(emp), { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5, 6], sla_resposta_min: 10 })
  })
})

describe('validação', () => {
  test('recusa intervalo invertido, hora inválida, sobreposição e semana toda fechada', () => {
    assert.equal(horarioValido({ semana: { ...semana([]), '1': [{ abre: '18:00', fecha: '09:00' }] } }), null)
    assert.equal(horarioValido({ semana: { ...semana([]), '1': [{ abre: '9h', fecha: '18:00' }] } }), null)
    assert.equal(horarioValido({ semana: { ...semana([]), '1': [{ abre: '09:00', fecha: '13:00' }, { abre: '12:00', fecha: '18:00' }] } }), null)
    assert.equal(horarioValido({ semana: { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] } }), null)
  })
  test('aceita pausa de almoço e soma só as horas abertas', () => {
    const h = horarioValido({ semana: { ...semana([]), '1': [{ abre: '14:00', fecha: '18:00' }, { abre: '09:00', fecha: '12:00' }] } })!
    assert.equal(horasDoDia(h, SEG), 7); assert.deepEqual(h.semana['1'][0], { abre: '09:00', fecha: '12:00' })
  })
  test('valor da loja inválido cai no da empresa', () => {
    const cfg = { empresa: NOVO.empresa, lojas: { '6': { semana: { '0': [] } } } }
    assert.equal(abreNoDia(horarioDaLoja(cfg, null, 6), SAB), true)
  })
})
