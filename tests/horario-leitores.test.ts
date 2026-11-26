/**
 * Horário por dia — FASE 2: os leitores usam o horário novo (24/11/2026).
 * Agenda pública, automações/transmissão (próxima abertura, pelo carregador lib/horario-empresa) e o alerta de
 * entrada parada. Empresa de exemplo: seg–sex 9h–18h e SÁBADO 9h–13h; outra só com o formato antigo (igual a hoje).
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { diasDeAgenda, horarioDaAgenda, horarioOferecido, horariosDoDia } from '@/lib/agendar-slots'
import { entradaParada } from '@/lib/alertas-entrada'
import { horarioDaEmpresa } from '@/lib/horario-empresa'
import { minutosDeExpediente, proximaAbertura, resumoDoHorario } from '@/lib/horario'

const SP = 'America/Sao_Paulo'
const dia = (abre: string, fecha: string) => [{ abre, fecha }]
const SABADO_REDUZIDO = { semana: { '0': [], '1': dia('09:00', '18:00'), '2': dia('09:00', '18:00'), '3': dia('09:00', '18:00'),
  '4': dia('09:00', '18:00'), '5': dia('09:00', '18:00'), '6': dia('09:00', '13:00') } }
const ANTIGO = { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5] }

/** Banco falso: só a leitura de configuracoes_sistema que o carregador faz. */
// Desde a etapa 1.1a, core.horario mora em empresa_config (uma linha por empresa/loja) e o formato antigo
// (horario_comercial) segue em configuracoes_sistema. O banco falso aceita o envelope de antes e o reparte.
const bancoCom = (linhas: { chave: string; valor: unknown }[]) => {
  const env = linhas.find((l) => l.chave === 'core.horario')?.valor as { empresa?: unknown; lojas?: Record<string, unknown> } | undefined
  const novas = env ? [
    ...(env.empresa != null ? [{ modulo: 'core', chave: 'horario', filial_id: null, valor: env.empresa }] : []),
    ...Object.entries(env.lojas ?? {}).map(([f, v]) => ({ modulo: 'core', chave: 'horario', filial_id: Number(f), valor: v })),
  ] : []
  const antiga = linhas.find((l) => l.chave === 'horario_comercial') ?? null
  return {
    from: (t: string) => t === 'empresa_config'
      ? { select: () => ({ eq: () => ({ or: async () => ({ data: novas, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: antiga, error: null }) }) }) }) },
  } as never
}

describe('agenda pública com sábado reduzido', () => {
  const h = horarioDaAgenda(SABADO_REDUZIDO)
  test('o sábado entra nos dias da agenda; o domingo não', () => {
    const dias = diasDeAgenda(h, Date.parse('2026-11-27T12:00:00-03:00'), SP) // sexta
    assert.deepEqual(dias.slice(0, 3), ['2026-11-27', '2026-11-28', '2026-11-30'])
  })
  test('sábado: horários das 9h às 12h30 (8), e 13h não é oferecido', () => {
    const s = horariosDoDia('2026-11-28', h, SP)
    assert.equal(s.length, 8)
    assert.ok(horarioOferecido(new Date('2026-11-28T12:30:00-03:00'), h, SP))
    assert.ok(!horarioOferecido(new Date('2026-11-28T13:00:00-03:00'), h, SP))
    assert.equal(horariosDoDia('2026-11-27', h, SP).length, 18) // sexta 9h–18h
  })
  test('formato antigo: igual a antes (sábado fora)', () => {
    const a = horarioDaAgenda(ANTIGO)
    assert.equal(horariosDoDia('2026-11-28', a, SP).length, 0)
    assert.ok(!horarioOferecido(new Date('2026-11-28T10:00:00-03:00'), a, SP))
  })
})

describe('alerta de entrada parada respeita o dia', () => {
  const sab10h = new Date('2026-11-28T10:00:00-03:00'), sab14h = new Date('2026-11-28T14:00:00-03:00')
  const antes = (d: Date, min: number) => new Date(d.getTime() - min * 60_000)
  test('sábado reduzido: 10h alerta; 14h (fechado) não', () => {
    assert.equal(entradaParada(antes(sab10h, 60), sab10h, SABADO_REDUZIDO, SP), true)
    assert.equal(entradaParada(antes(sab14h, 60), sab14h, SABADO_REDUZIDO, SP), false)
  })
  test('formato antigo seg–sex: sábado não alerta (como hoje)', () => {
    assert.equal(entradaParada(antes(sab10h, 60), sab10h, ANTIGO, SP), false)
  })
})

describe('automações e transmissão: próxima abertura pelo horário da loja', () => {
  const sab1305 = new Date('2026-11-28T13:05:00-03:00')
  test('core.horario com sábado reduzido: sábado 13h05 → segunda 9h; sábado 10h → agora', async () => {
    const h = await horarioDaEmpresa(bancoCom([{ chave: 'core.horario', valor: { empresa: SABADO_REDUZIDO, lojas: {} } }]), 1)
    assert.equal(proximaAbertura(sab1305, h, SP).toISOString(), '2026-11-30T12:00:00.000Z')
    const sab10 = new Date('2026-11-28T10:00:00-03:00')
    assert.equal(proximaAbertura(sab10, h, SP).getTime(), sab10.getTime())
  })
  test('loja com horário próprio vence o da empresa', async () => {
    const h = await horarioDaEmpresa(bancoCom([{ chave: 'core.horario', valor: { empresa: { semana: { ...SABADO_REDUZIDO.semana, '6': [] } }, lojas: { '6': SABADO_REDUZIDO } } }]), 1, 6)
    assert.equal(proximaAbertura(new Date('2026-11-28T10:00:00-03:00'), h, SP).toISOString(), '2026-11-28T13:00:00.000Z')
  })
  test('sem core.horario (o formato antigo não é mais lido, 1.1h): vale o padrão seg–sex — sábado 10h → segunda 9h', async () => {
    const h = await horarioDaEmpresa(bancoCom([{ chave: 'horario_comercial', valor: ANTIGO }]), 1)
    assert.equal(proximaAbertura(new Date('2026-11-28T10:00:00-03:00'), h, SP).toISOString(), '2026-11-30T12:00:00.000Z')
  })
})

describe('expediente pelo horário por dia (devolução da esteira, 1.1h parte 2)', () => {
  const h = SABADO_REDUZIDO as never
  test('sábado reduzido: das 12h às 18h do sábado conta só 1 hora (o formato antigo contava 6)', () => {
    assert.equal(minutosDeExpediente(new Date('2026-11-28T12:00:00-03:00'), new Date('2026-11-28T18:00:00-03:00'), h, SP), 60)
  })
  test('sexta 17h30 → segunda 9h30: 30 min de sexta + 4 h de sábado + 30 min de segunda', () => {
    assert.equal(minutosDeExpediente(new Date('2026-11-27T17:30:00-03:00'), new Date('2026-11-30T09:30:00-03:00'), h, SP), 30 + 240 + 30)
  })
  test('com pausa de almoço, o intervalo fechado não conta', () => {
    const almoco = { semana: { ...SABADO_REDUZIDO.semana, '3': [{ abre: '09:00', fecha: '12:00' }, { abre: '13:00', fecha: '18:00' }] } } as never
    assert.equal(minutosDeExpediente(new Date('2026-11-25T11:30:00-03:00'), new Date('2026-11-25T13:30:00-03:00'), almoco, SP), 60)
  })
  test('loja fechada todo dia: tempo corrido (o prazo não pode nunca vencer)', () => {
    const fechada = { semana: { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] } } as never
    assert.equal(minutosDeExpediente(new Date('2026-11-25T10:00:00-03:00'), new Date('2026-11-25T10:45:00-03:00'), fechada, SP), 45)
  })
  test('resumo legível da semana', () => {
    assert.equal(resumoDoHorario(h), 'seg–sex 09:00–18:00 · sáb 09:00–13:00')
  })
})
