/**
 * INBOX ÚNICA (04/11/2026).
 *
 * As regras puras da lista e do sino, e três travas de código:
 *   - a Inbox, o sino, o topo e os avisos não leem as views `leads` nem `lead_mensagens`;
 *   - uma assinatura de tempo real por aba: só o hub abre canal;
 *   - /comunicacao é núcleo do menu, no grupo Comunicação.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { aguardandoResposta, filtroDoCursor, termosDaBusca } from '@/lib/inbox/consultas'
import { aplicarNoSino, ordenarSino, type LinhaConversa } from '@/lib/inbox/sino'
import { GRUPO_DO_HREF, hrefsLigados } from '@/lib/menu'

test('aguardando resposta: a última mensagem é do cliente', () => {
  assert.equal(aguardandoResposta({ ultima_recebida_at: null, ultima_enviada_at: null }), false)
  assert.equal(aguardandoResposta({ ultima_recebida_at: '2026-11-04T10:00:00Z', ultima_enviada_at: null }), true)
  assert.equal(aguardandoResposta({ ultima_recebida_at: '2026-11-04T10:00:00Z', ultima_enviada_at: '2026-11-04T09:00:00Z' }), true)
  assert.equal(aguardandoResposta({ ultima_recebida_at: '2026-11-04T10:00:00Z', ultima_enviada_at: '2026-11-04T10:05:00Z' }), false)
  // Formatos diferentes do mesmo instante (Realtime x PostgREST) não confundem.
  assert.equal(aguardandoResposta({ ultima_recebida_at: '2026-11-04 10:00:00+00', ultima_enviada_at: '2026-11-04T10:00:00.000Z' }), false)
})

test('busca: telefone, @instagram e nome', () => {
  assert.deepEqual(termosDaBusca('(19) 99887-7665'), { nome: null, telefone: '19998877665', instagram: null })
  assert.deepEqual(termosDaBusca('@jmstore'), { nome: null, telefone: null, instagram: 'jmstore' })
  assert.deepEqual(termosDaBusca('Maria Silva'), { nome: 'Maria Silva', telefone: null, instagram: 'MariaSilva' })
  // Caracteres que quebram o filtro do PostgREST saem.
  assert.equal(termosDaBusca('a,b(c)*%').nome, 'a b c')
  assert.deepEqual(termosDaBusca('   '), { nome: null, telefone: null, instagram: null })
})

test('cursor da lista: última mensagem desc, id desc', () => {
  assert.equal(filtroDoCursor({ momento: '2026-11-04T10:00:00Z', id: 9 }),
    'ultima_mensagem_at.lt.2026-11-04T10:00:00Z,and(ultima_mensagem_at.eq.2026-11-04T10:00:00Z,id.lt.9)')
})

test('sino: entra com não lida, sai ao ler, sai ao apagar', () => {
  const mapa = new Map<number, LinhaConversa>()
  const linha = (id: number, nao_lidas: number, em: string): LinhaConversa => ({ id, contato_id: id * 10, canal_id: 1, filial_id: 3, nao_lidas, ultima_mensagem_at: em })
  assert.equal(aplicarNoSino(mapa, { tabela: 'conversas', tipo: 'INSERT', novo: linha(1, 2, '2026-11-04T10:00:00Z'), antigo: null }), true)
  assert.equal(aplicarNoSino(mapa, { tabela: 'conversas', tipo: 'UPDATE', novo: linha(2, 1, '2026-11-04T11:00:00Z'), antigo: null }), true)
  // Mesmo estado, outro formato de data: não redesenha.
  assert.equal(aplicarNoSino(mapa, { tabela: 'conversas', tipo: 'UPDATE', novo: linha(2, 1, '2026-11-04 11:00:00+00'), antigo: null }), false)
  assert.deepEqual(ordenarSino(mapa.values()).map((c) => c.id), [2, 1])
  assert.equal(aplicarNoSino(mapa, { tabela: 'conversas', tipo: 'UPDATE', novo: linha(1, 0, '2026-11-04T10:00:00Z'), antigo: null }), true)
  assert.equal(mapa.has(1), false)
  assert.equal(aplicarNoSino(mapa, { tabela: 'conversas', tipo: 'DELETE', novo: null, antigo: { id: 2 } }), true)
  assert.equal(mapa.size, 0)
  // Conversa sem não lida que nunca esteve no sino: nada muda.
  assert.equal(aplicarNoSino(mapa, { tabela: 'conversas', tipo: 'UPDATE', novo: linha(3, 0, '2026-11-04T12:00:00Z'), antigo: null }), false)
})

const ARQUIVOS_DA_INBOX = [
  ...readdirSync('lib/inbox').map((f) => `lib/inbox/${f}`),
  ...readdirSync('components/modules/comunicacao').map((f) => `components/modules/comunicacao/${f}`),
  'app/(dashboard)/comunicacao/page.tsx',
  'app/api/comunicacao/[id]/lojas/route.ts',
  'components/layout/tempo-real-empresa.tsx',
  'components/layout/topbar.tsx',
  'components/layout/notification-provider.tsx',
]

test('Inbox, sino, topo e avisos não leem as views leads nem lead_mensagens', () => {
  for (const f of ARQUIVOS_DA_INBOX) {
    const src = readFileSync(f, 'utf8')
    assert.doesNotMatch(src, /from\(\s*['"`]leads['"`]\s*\)/, `${f} lê a view leads`)
    assert.doesNotMatch(src, /from\(\s*['"`]lead_mensagens['"`]\s*\)/, `${f} lê a view lead_mensagens`)
    assert.doesNotMatch(src, /realtime\/tabelas/, `${f} usa o realtime antigo`)
  }
})

test('uma assinatura de tempo real por aba: só o hub abre canal', () => {
  for (const f of ARQUIVOS_DA_INBOX.filter((x) => !x.endsWith('tempo-real-empresa.tsx'))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /\.channel\(/, `${f} abre canal próprio`)
  }
  const hub = readFileSync('components/layout/tempo-real-empresa.tsx', 'utf8')
  assert.equal((hub.match(/\.channel\(/g) ?? []).length, 1)
  assert.match(hub, /filter: filtro/)
  assert.match(hub, /empresa_id=eq\./)
  // O layout logado monta o hub uma vez, em volta de tudo.
  assert.match(readFileSync('app/(dashboard)/layout.tsx', 'utf8'), /<TempoRealEmpresa empresaId=\{empresaId\}>/)
})

test('/comunicacao é núcleo e mora no grupo Comunicação', () => {
  assert.equal(GRUPO_DO_HREF['/comunicacao'], 'comunicacao')
  assert.ok(hrefsLigados([]).has('/comunicacao'))
})
