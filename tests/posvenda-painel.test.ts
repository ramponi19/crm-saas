import test from 'node:test'
import assert from 'node:assert/strict'
import { meioDoResultado, montarPainel, pctNoPrazo, type PassoDoPainel } from '@/lib/posvenda/painel'
import { contarPosVendaDoDia } from '@/lib/posvenda/contador'

// 25/11/2026: painel do gestor do Pós-venda (regras puras) e o contador do menu.

const FUSO = 'America/Sao_Paulo'
const HOJE = '2026-11-25'
// meio-dia em São Paulo (15h UTC) do dia dado
const em = (dia: string) => `${dia}T15:00:00.000Z`
let seq = 0
const passo = (p: Partial<PassoDoPainel>): PassoDoPainel => ({
  id: ++seq, responsavel_id: 'ana', filial_id: 1, status: 'pendente', previsto_para: em(HOJE), feito_em: null,
  resultado: null, motivo: null, tolerancia_dias: 3, ...p,
})

test('meio do contato: pelo resultado do Feito ou pelo canal da nota', () => {
  assert.equal(meioDoResultado('app da loja'), 'app_loja')
  assert.equal(meioDoResultado('Ligação'), 'ligacao')
  assert.equal(meioDoResultado('Nexus'), 'nexus')
  assert.equal(meioDoResultado(null, 'app_loja'), 'app_loja')
  assert.equal(meioDoResultado(null, 'ligacao'), 'ligacao')
  assert.equal(meioDoResultado('respondeu feliz', null), 'sem_registro')
})

test('pendentes, atrasados, feitos no prazo e fora, perdidos, sem resposta e pulados', () => {
  const passos = [
    passo({ previsto_para: em('2026-11-20') }), // atrasado (e pendente)
    passo({ previsto_para: em(HOJE) }), // de hoje (pendente, não atrasado)
    passo({ previsto_para: em('2026-11-28') }), // futuro: não conta
    passo({ status: 'feito', previsto_para: em('2026-11-24'), feito_em: em('2026-11-24'), resultado: 'app da loja' }), // no prazo
    passo({ status: 'feito', previsto_para: em('2026-11-20'), feito_em: em('2026-11-24'), resultado: 'ligação' }), // fora do prazo
    passo({ status: 'feito', previsto_para: em('2026-10-01'), feito_em: em('2026-10-02') }), // fora do período de 7 dias
    passo({ status: 'perdido', previsto_para: em('2026-11-19'), tolerancia_dias: 3 }), // perdido em 23/11
    passo({ status: 'perdido', previsto_para: em('2026-10-01'), tolerancia_dias: 3 }), // perdido antes do período
    passo({ status: 'sem_resposta', feito_em: em('2026-11-22') }),
    passo({ status: 'pulado', feito_em: em('2026-11-23'), motivo: 'cliente pediu' }),
    passo({ status: 'pulado', feito_em: em('2026-11-24'), motivo: 'cliente pediu' }),
    passo({ responsavel_id: 'bia', previsto_para: em(HOJE) }),
  ]
  const { linhas, total } = montarPainel(
    { passos, notas: [], chamados: [], pessoas: ['ana', 'bia', 'caio'] },
    { periodo: '7', hoje: HOJE, fuso: FUSO, loja: null },
  )
  const ana = linhas.find((l) => l.pessoa === 'ana')!
  assert.equal(ana.pendentes, 2)
  assert.equal(ana.atrasados, 1)
  assert.equal(ana.feitos, 2)
  assert.equal(ana.noPrazo, 1)
  assert.equal(pctNoPrazo(ana), 50)
  assert.equal(ana.perdidos, 1)
  assert.equal(ana.semResposta, 1)
  assert.equal(ana.pulados, 2)
  assert.deepEqual(ana.motivosPulo, [{ motivo: 'cliente pediu', n: 2 }])
  assert.equal(ana.porMeio.app_loja, 1)
  assert.equal(ana.porMeio.ligacao, 1)
  // quem tem atrasado vem primeiro; quem não tem nada aparece zerado
  assert.deepEqual(linhas.map((l) => l.pessoa), ['ana', 'bia', 'caio'])
  assert.equal(linhas[2].pendentes, 0)
  assert.equal(total.pendentes, 3)
  assert.equal(total.atrasados, 1)
  assert.equal(pctNoPrazo({ feitos: 0, noPrazo: 0 }), null)
})

test('período "hoje" só conta o que foi feito hoje; loja filtra passos, notas e chamados', () => {
  const passos = [
    passo({ status: 'feito', previsto_para: em(HOJE), feito_em: em(HOJE), filial_id: 1 }),
    passo({ status: 'feito', previsto_para: em('2026-11-24'), feito_em: em('2026-11-24'), filial_id: 1 }),
    passo({ status: 'feito', previsto_para: em(HOJE), feito_em: em(HOJE), filial_id: 2 }),
  ]
  const notas = [
    { vendedor_id: 'ana', nota: 10, respondida_em: em(HOJE), canal: 'app_loja', acompanhamento_id: passos[0].id, filial_id: 1 },
    { vendedor_id: 'ana', nota: 7, respondida_em: em(HOJE), canal: null, acompanhamento_id: null, filial_id: 1 },
    { vendedor_id: 'ana', nota: 0, respondida_em: em(HOJE), canal: null, acompanhamento_id: null, filial_id: 2 },
    { vendedor_id: null, nota: 9, respondida_em: em(HOJE), canal: null, acompanhamento_id: null, filial_id: 1 },
  ]
  const chamados = [{ responsavel_negocio: 'ana', filial_id: 1 }, { responsavel_negocio: 'ana', filial_id: 2 }, { responsavel_negocio: null, filial_id: 1 }]
  const loja1 = montarPainel({ passos, notas, chamados, pessoas: [] }, { periodo: 'hoje', hoje: HOJE, fuso: FUSO, loja: 1 })
  const ana = loja1.linhas.find((l) => l.pessoa === 'ana')!
  assert.equal(ana.feitos, 1)
  assert.equal(ana.porMeio.app_loja, 1) // o meio veio do canal da nota
  assert.equal(ana.notas, 2)
  assert.equal(ana.mediaNota, 8.5)
  assert.equal(ana.chamadosAbertos, 1)
  const todas = montarPainel({ passos, notas, chamados, pessoas: [] }, { periodo: 'hoje', hoje: HOJE, fuso: FUSO, loja: null })
  assert.equal(todas.total.feitos, 2)
  assert.equal(todas.total.notas, 3)
  assert.equal(todas.total.mediaNota, 5.7)
  assert.equal(todas.total.chamadosAbertos, 2)
})

test('contador do menu: pendentes até o fim de hoje no fuso; erro vira 0', async () => {
  const chamadas: unknown[][] = []
  const q = {
    select: (...a: unknown[]) => { chamadas.push(['select', ...a]); return q },
    eq: (...a: unknown[]) => { chamadas.push(['eq', ...a]); return q },
    lt: (...a: unknown[]) => { chamadas.push(['lt', ...a]); return Promise.resolve({ count: 7, error: null }) },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = { from: () => q } as any
  assert.equal(await contarPosVendaDoDia(db, 1, FUSO, new Date('2026-11-25T23:30:00Z')), 7)
  // 20h30 em São Paulo do dia 25 → corte = meia-noite do dia 26 em SP = 03:00 UTC
  assert.deepEqual(chamadas.at(-1), ['lt', 'previsto_para', '2026-11-26T03:00:00.000Z'])
  assert.ok(chamadas.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'pendente'))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quebrado = { from: () => { throw new Error('x') } } as any
  assert.equal(await contarPosVendaDoDia(quebrado, 1, FUSO), 0)
})
