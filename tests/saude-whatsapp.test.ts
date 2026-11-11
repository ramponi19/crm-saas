import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saudeDaWaba } from '@/lib/canais/meta'
import { motivoRecusaMeta, PREFIXO_RECUSA_META } from '@/lib/canais/falha-meta'
import { textoSemPagamento } from '@/lib/canais/saude-whatsapp'

// Resposta real da Graph para as WABAs da JM em 11/11/2026 (ids trocados).
const BLOQUEADA = {
  id: 'W1', health_status: {
    can_send_message: 'BLOCKED',
    entities: [
      { entity_type: 'WABA', id: 'W1', can_send_message: 'BLOCKED', errors: [{ error_code: 141006, error_description: 'There is an error with the payment method. This will block business initiated conversations.', possible_solution: 'Add a new payment method.' }] },
      { entity_type: 'BUSINESS', id: 'B1', can_send_message: 'LIMITED', errors: [{ error_code: 141010, error_description: 'The Business has not passed business verification.' }] },
      { entity_type: 'APP', id: 'A1', can_send_message: 'AVAILABLE' },
    ],
  },
}
const SO_VERIFICACAO = { id: 'W2', health_status: { can_send_message: 'LIMITED', entities: [{ entity_type: 'BUSINESS', id: 'B1', can_send_message: 'LIMITED', errors: [{ error_code: 141010, error_description: 'The Business has not passed business verification.' }] }] } }

async function comFetch<T>(resposta: unknown, status: number, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify(resposta), { status })) as typeof fetch
  try { return await fn() } finally { globalThis.fetch = original }
}

test('saúde da WABA: 141006 = sem forma de pagamento', async () => {
  const s = await comFetch(BLOQUEADA, 200, () => saudeDaWaba('W1', 't'))
  assert.ok(!('erro' in s))
  if ('erro' in s) return
  assert.equal(s.pagamentoOk, false)
  assert.equal(s.podeIniciar, 'BLOCKED')
  assert.deepEqual(s.erros.map((e) => e.codigo), [141006, 141010])
})

test('saúde da WABA: só falta de verificação não é falta de pagamento', async () => {
  const s = await comFetch(SO_VERIFICACAO, 200, () => saudeDaWaba('W2', 't'))
  assert.ok(!('erro' in s) && s.pagamentoOk === true && s.podeIniciar === 'LIMITED')
})

test('saúde da WABA: erro da Graph volta como erro (o aviso não inventa nada)', async () => {
  const s = await comFetch({ error: { message: 'sem permissão', code: 10 } }, 400, () => saudeDaWaba('W3', 't'))
  assert.deepEqual(s, { erro: 'sem permissão', codigo: 10 })
})

test('textos: aviso por loja e motivo da recusa depois de aceita', () => {
  assert.equal(textoSemPagamento('Jaguariúna'), 'Conta da Meta de Jaguariúna sem forma de pagamento')
  assert.equal(motivoRecusaMeta('A conta da Meta está sem forma de pagamento.'), `${PREFIXO_RECUSA_META}A conta da Meta está sem forma de pagamento.`)
  assert.equal(motivoRecusaMeta(null), `${PREFIXO_RECUSA_META}sem motivo informado`)
  assert.ok(motivoRecusaMeta('x'.repeat(400)).length <= 300)
})
