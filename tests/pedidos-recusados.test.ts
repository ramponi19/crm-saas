/**
 * PEDIDO RECUSADO NÃO SOME (04/11/2026).
 *
 * Desde a viagem 1 recusar marca `status = 'recusado'`. A Central mostra ao dono a
 * recusa do ÚLTIMO pedido de cada módulo e deixa pedir de novo; um pedido novo
 * esconde a recusa antiga. O superadmin vê os recusados num histórico.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pedidosERecusas, tilesDaCentral } from '@/lib/modulos-central'

const p = (modulo: string, status: string, pedido_em: string, recusado_em: string | null = null) => ({ modulo, status, pedido_em, recusado_em })

test('o último pedido de cada módulo decide: aberto ou recusado', () => {
  const r = pedidosERecusas([
    p('/relatorios', 'recusado', '2026-11-01T10:00:00+00:00', '2026-11-01T12:00:00+00:00'),
    p('/zapintel', 'recusado', '2026-11-01T10:00:00+00:00', '2026-11-02T09:00:00+00:00'),
    p('/zapintel', 'pendente', '2026-11-03T10:00:00+00:00'),
  ])
  assert.deepEqual(r.recusas, { '/relatorios': '2026-11-01T12:00:00+00:00' })
  assert.deepEqual(r.pedidos, { '/zapintel': '2026-11-03T10:00:00+00:00' })
})

test('tile: recusa aparece sem pedido em aberto e some quando há pedido novo', () => {
  const base = { ligados: new Set<string>(), plano: 'free', ativos: new Set<string>() }
  const recusado = tilesDaCentral({ ...base, recusas: { '/zapintel': '2026-11-02T09:00:00+00:00' } }).find((t) => t.href === '/zapintel')!
  assert.equal(recusado.recusadoEm, '2026-11-02T09:00:00+00:00')
  assert.equal(recusado.pedidoEm, null)
  const pedidoDeNovo = tilesDaCentral({ ...base, pedidos: { '/zapintel': '2026-11-03T10:00:00+00:00' }, recusas: { '/zapintel': '2026-11-02T09:00:00+00:00' } }).find((t) => t.href === '/zapintel')!
  assert.equal(pedidoDeNovo.recusadoEm, null)
})

test('nenhuma tela diz mais que recusar apaga', () => {
  for (const f of ['app/superadmin/pedidos/page.tsx', 'components/superadmin/pedidos-modulo.tsx']) {
    const src = readFileSync(f, 'utf8')
    assert.doesNotMatch(src, /recusar apaga|O pedido é apagado/i, f)
  }
  // A Central lê pendentes E recusados.
  assert.match(readFileSync('app/(dashboard)/modulos/page.tsx', 'utf8'), /\.in\('status', \['pendente', 'recusado'\]\)/)
  // O superadmin lista os recusados.
  assert.match(readFileSync('app/superadmin/pedidos/page.tsx', 'utf8'), /\.eq\('status', 'recusado'\)/)
})
