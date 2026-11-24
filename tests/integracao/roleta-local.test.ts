/**
 * ROLETA DE VENDAS CONTRA O BANCO LOCAL DE VERDADE (npm run test:local; scripts/teste-local.sh).
 *
 * A conta de serviço e quem está com `participa_roleta = false` (20261124001000) não recebem lead pela roleta
 * de vendas (lib/roleta.ts), que alimenta a distribuição, a agenda, os portais e o formulário de imóveis.
 * JM de teste (empresa 1): matriz 3 com M1, M2 e SL (vendedor sem loja = matriz), administradores A e B e o dono.
 */
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const URL_LOCAL = process.env.TESTE_LOCAL_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_LOCAL)) throw new Error('RECUSADO: test:local só roda contra o banco local (TESTE_LOCAL_URL em 127.0.0.1).')
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TESTE_LOCAL_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TESTE_LOCAL_SERVICE

const svc = createClient(URL_LOCAL, process.env.TESTE_LOCAL_SERVICE!, { auth: { persistSession: false } })
const { membrosElegiveis, proximoResponsavel } = await import('@/lib/roleta')

const EMPRESA = 1, MATRIZ = 3
const M1 = '0e5e0000-0000-4000-8000-000000000101'
const SL = '0e5e0000-0000-4000-8000-000000000103'
const marcar = async (usuario: string, patch: Record<string, boolean>) => {
  const { error } = await svc.from('empresa_usuarios').update(patch).eq('empresa_id', EMPRESA).eq('usuario_id', usuario)
  if (error) throw error
}

describe('roleta de vendas respeita conta de serviço e participa_roleta', () => {
  after(async () => {
    await marcar(SL, { conta_servico: false, participa_roleta: true })
    await marcar(M1, { conta_servico: false, participa_roleta: true })
  })
  test('sem marca: a matriz tem o vendedor sem loja e o M1 (como hoje)', async () => {
    const { ids } = await membrosElegiveis(svc as never, EMPRESA, MATRIZ)
    assert.ok(ids.includes(SL)); assert.ok(ids.includes(M1))
  })
  test('conta de serviço sai; a roleta nunca a escolhe', async () => {
    await marcar(SL, { conta_servico: true })
    const { ids } = await membrosElegiveis(svc as never, EMPRESA, MATRIZ)
    assert.ok(!ids.includes(SL))
    for (let i = 0; i < ids.length * 2; i++) assert.notEqual(await proximoResponsavel(svc as never, EMPRESA, MATRIZ), SL)
  })
  test('participa_roleta desligado tira a pessoa da distribuição', async () => {
    await marcar(M1, { participa_roleta: false })
    const { ids } = await membrosElegiveis(svc as never, EMPRESA, MATRIZ)
    assert.ok(!ids.includes(M1))
  })
})
