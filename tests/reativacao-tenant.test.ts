/**
 * Reativação de leads frios: a cadência tem de ser da PRÓPRIA empresa (porte do
 * eaa1460, auditoria de 16/10, em 09/11/2026).
 *
 * O job lê os passos da cadência e inscreve os leads nela pelo cliente de SERVIÇO
 * (sem RLS). Com o id de uma cadência de outra empresa salvo na configuração, as
 * inscrições iam para a cadência do outro tenant. Duas travas: a rota que salva
 * recusa (404) e a execução não inscreve ninguém se a cadência não for da empresa.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { bancoFalso, type Consulta, type Responder } from './banco-falso'

const estado = {
  responder: (() => ({ data: null, error: null })) as Responder,
  bancos: [] as ReturnType<typeof bancoFalso>[],
}
function novo() {
  const db = bancoFalso((c) => estado.responder(c)) as ReturnType<typeof bancoFalso> & { auth: unknown }
  db.auth = { getUser: async () => ({ data: { user: { id: 'u-1' } } }) }
  estado.bancos.push(db)
  return db
}
const todas = (): Consulta[] => estado.bancos.flatMap((b) => b.consultas)
const ok = (data: unknown = null) => ({ data, error: null })

mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => novo(), getEmpresaId: async () => 1 } })
mock.module('@/lib/supabase/service', { namedExports: { createServiceClient: () => novo() } })
// Stripe de mentira: toda assinatura está `past_due` (não consulta planos).
mock.module('stripe', {
  defaultExport: class { subscriptions = { retrieve: async () => ({ status: 'past_due', items: { data: [] } }) } },
})
process.env.STRIPE_SECRET_KEY ??= 'sk_test_falsa'

const { POST: salvarReativacao } = await import('@/app/api/reativacao/route')
const { reativarFrios } = await import('@/lib/reativacao')
const { reconciliarAssinaturas } = await import('@/lib/stripe')

/** Banco com a cadência 7 da empresa 1 e a 99 de OUTRA empresa; o usuário é dono. */
function banco(extra: (c: Consulta) => { data: unknown; error: null } | undefined = () => undefined): Responder {
  return (c) => {
    const e = extra(c); if (e) return e
    if (c.tabela === 'empresa_usuarios') return ok({ role: 'owner' })
    if (c.tabela === 'usuarios') return ok({ is_super_admin: false })
    if (c.tabela === 'cadencias') {
      const id = c.filtros.find(([m, col]) => m === 'eq' && col === 'id')?.[2]
      const emp = c.filtros.find(([m, col]) => m === 'eq' && col === 'empresa_id')?.[2]
      return ok(id === 7 && emp === 1 ? { id: 7 } : null)
    }
    return ok()
  }
}
const post = (corpo: unknown) => salvarReativacao(new Request('http://x/api/reativacao', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
}))

beforeEach(() => { estado.bancos = []; estado.responder = banco() })

describe('reativação: cadência de outra empresa', () => {
  test('salvar com a cadência de OUTRA empresa: 404 e nada gravado', async () => {
    const r = await post({ ativo: true, dias_frio: 30, cadencia_id: 99 })
    assert.equal(r.status, 404)
    assert.equal(todas().filter((c) => c.op === 'upsert').length, 0)
  })

  test('salvar com a cadência da própria empresa: grava', async () => {
    const r = await post({ ativo: true, dias_frio: 30, cadencia_id: 7 })
    assert.equal(r.status, 200)
    assert.equal(todas().filter((c) => c.op === 'upsert' && c.tabela === 'configuracoes_sistema').length, 1)
  })

  test('salvar sem cadência continua valendo (desliga a reativação)', async () => {
    const r = await post({ ativo: false })
    assert.equal(r.status, 200)
  })

  test('execução com configuração antiga apontando para cadência alheia: ninguém é inscrito', async () => {
    estado.responder = banco((c) => c.tabela === 'configuracoes_sistema' ? ok({ valor: { ativo: true, cadencia_id: 99 } }) : undefined)
    const r = await reativarFrios(novo() as never, 1)
    assert.deepEqual(r, { reativados: 0 })
    assert.equal(todas().filter((c) => c.tabela === 'cadencia_passos').length, 0, 'nem lê os passos da cadência alheia')
    assert.equal(todas().filter((c) => c.op === 'insert').length, 0)
  })

  test('execução com a cadência da empresa segue para os passos', async () => {
    estado.responder = banco((c) => c.tabela === 'configuracoes_sistema' ? ok({ valor: { ativo: true, cadencia_id: 7 } }) : undefined)
    await reativarFrios(novo() as never, 1)
    assert.equal(todas().filter((c) => c.tabela === 'cadencia_passos').length, 1)
  })
})

describe('sync-stripe: update recusado não conta como atualizado', () => {
  test('o banco recusa a empresa 2: 1 atualizada, 1 erro com o motivo', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'empresas' && c.op === 'select') return ok([{ id: 1, stripe_subscription_id: 's1' }, { id: 2, stripe_subscription_id: 's2' }])
      if (c.tabela === 'empresas' && c.op === 'update') {
        const id = c.filtros.find(([m, col]) => m === 'eq' && col === 'id')?.[2]
        return id === 2 ? { data: null, error: { message: 'permission denied for table empresas' } } : ok()
      }
      return ok()
    }
    const r = await reconciliarAssinaturas(novo())
    assert.equal(r.atualizadas, 1)
    assert.equal(r.erros.length, 1)
    assert.match(r.erros[0], /empresa 2: permission denied/)
  })
})
