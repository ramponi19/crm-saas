/** Situação da assinatura para o aviso do topo (lib/situacao-empresa.ts, 17/11/2026). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { situacaoDaEmpresa, textoDaSituacao } from '@/lib/situacao-empresa'

const AGORA = new Date('2026-11-17T12:00:00Z')
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000).toISOString()

test('ativa sem teste (a JM: contrato fora do Stripe, trialing é só o padrão da coluna) = nada a avisar', () => {
  assert.deepEqual(situacaoDaEmpresa({ status: 'ativo', stripe_status: 'trialing', trial_ends_at: null }, AGORA), { tipo: 'ok' })
})

test('teste: avisa a partir de 3 dias antes do fim, não antes', () => {
  assert.deepEqual(situacaoDaEmpresa({ status: 'ativo', stripe_status: 'trialing', trial_ends_at: dias(5) }, AGORA), { tipo: 'ok' })
  assert.deepEqual(situacaoDaEmpresa({ status: 'ativo', stripe_status: 'trialing', trial_ends_at: dias(3) }, AGORA), { tipo: 'teste_acabando', dias: 3 })
  assert.deepEqual(situacaoDaEmpresa({ status: 'ativo', stripe_status: 'trialing', trial_ends_at: dias(0.2) }, AGORA), { tipo: 'teste_acabando', dias: 1 })
  // com assinatura ativa, o fim do teste não importa
  assert.deepEqual(situacaoDaEmpresa({ status: 'ativo', stripe_status: 'active', trial_ends_at: dias(1) }, AGORA), { tipo: 'ok' })
})

test('pagamento atrasado avisa; status fora de ativo = somente leitura, com o motivo', () => {
  assert.deepEqual(situacaoDaEmpresa({ status: 'ativo', stripe_status: 'past_due', trial_ends_at: null }, AGORA), { tipo: 'atrasado' })
  assert.deepEqual(situacaoDaEmpresa({ status: 'suspenso', stripe_status: 'trialing', trial_ends_at: dias(-1) }, AGORA), { tipo: 'somente_leitura', motivo: 'teste_vencido' })
  assert.deepEqual(situacaoDaEmpresa({ status: 'suspenso', stripe_status: 'canceled', trial_ends_at: null }, AGORA), { tipo: 'somente_leitura', motivo: 'assinatura' })
  assert.deepEqual(situacaoDaEmpresa({ status: 'suspenso', stripe_status: 'trialing', trial_ends_at: null }, AGORA), { tipo: 'somente_leitura', motivo: 'suspensa' })
  assert.match(textoDaSituacao({ tipo: 'somente_leitura', motivo: 'teste_vencido' })!.corpo, /Nenhum dado foi apagado/)
})

test('empresa de demonstração nunca recebe aviso', () => {
  assert.deepEqual(situacaoDaEmpresa({ status: 'suspenso', stripe_status: 'canceled', trial_ends_at: null, demo: true }, AGORA), { tipo: 'ok' })
})
