import { test } from 'node:test'
import assert from 'node:assert/strict'
import { umPorContatoELoja } from '@/lib/leads'

// O caso do Osvaldo Junior (06/11/2026): contato fundido com dois negócios abertos na
// mesma loja aparecia duas vezes na busca e na lista de leads da tarefa.
test('um por contato e loja: fica o principal (ativo, depois o mais novo), na ordem do 1º visto', () => {
  const lista = [
    { id: 512, contato_id: 837, filial_id: 3, created_at: '2026-08-12T13:18:04Z', ativo: true },
    { id: 900, contato_id: 1, filial_id: 3, created_at: '2026-09-01T00:00:00Z', ativo: true },
    { id: 885, contato_id: 837, filial_id: 3, created_at: '2026-08-13T20:51:27Z', ativo: true },
    { id: 886, contato_id: 837, filial_id: 6, created_at: '2026-08-01T00:00:00Z', ativo: true },
    { id: 990, contato_id: 1, filial_id: 3, created_at: '2026-10-01T00:00:00Z', ativo: false },
  ]
  assert.deepEqual(umPorContatoELoja(lista).map((n) => n.id), [885, 900, 886])
})

test('um por contato e loja: loja nula é uma loja só, e o id desempata', () => {
  const lista = [
    { id: 1, contato_id: 5, filial_id: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 2, contato_id: 5, filial_id: null, created_at: '2026-01-01T00:00:00Z' },
  ]
  assert.deepEqual(umPorContatoELoja(lista).map((n) => n.id), [2])
})
