/**
 * FERRAMENTAS FORA DO MENU (etapa 0, 21/10/2026).
 *
 * Simular parcela, Check IMEI e Consulta FIPE saíram do menu lateral e moram
 * dentro de Orçamentos, Estoque e Avaliações. O módulo continua o mesmo — é ele
 * que o segmento libera —, então duas coisas precisam continuar de pé:
 *   - a trava de rota reconhece a rota nova como o módulo antigo (sem isso, uma
 *     empresa sem Check IMEI abriria /estoque/imei só por ter Estoque);
 *   - o menu não mostra a ferramenta, mas quem pergunta "está liberada?" (aba,
 *     ⌘K) recebe a mesma resposta que o menu daria.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloDaRota, resolverMenu, resolverFerramentas, type ResolverMenuInput } from '@/lib/menu'

test('a trava reconhece a rota nova como o módulo da ferramenta', () => {
  assert.equal(moduloDaRota('/orcamentos/parcela'), '/simular-parcela')
  assert.equal(moduloDaRota('/estoque/imei'), '/check-imei')
  assert.equal(moduloDaRota('/avaliacoes/fipe'), '/consulta-fipe')
  // A tela-casa continua sendo ela mesma.
  assert.equal(moduloDaRota('/estoque'), '/estoque')
  assert.equal(moduloDaRota('/orcamentos/cotacao'), '/orcamentos')
})

const base: ResolverMenuInput = {
  segmento: 'varejo', role: 'owner', isSuperAdmin: false,
  segOverride: { habilitados: ['/orcamentos', '/estoque', '/simular-parcela', '/check-imei'] },
}

test('ferramenta liberada não vira item de menu, mas é entregue às telas', () => {
  const hrefs = resolverMenu(base).flatMap((g) => g.items.map((i) => i.href))
  assert.ok(hrefs.includes('/estoque'))
  assert.ok(!hrefs.includes('/check-imei'))
  assert.ok(!hrefs.includes('/simular-parcela'))
  const f = resolverFerramentas(base)
  assert.deepEqual(f.map((x) => [x.href, x.rota]).sort(), [['/check-imei', '/estoque/imei'], ['/simular-parcela', '/orcamentos/parcela']])
})

test('ferramenta não liberada não aparece em lugar nenhum', () => {
  const f = resolverFerramentas({ ...base, segOverride: { habilitados: ['/orcamentos', '/estoque'] } })
  assert.equal(f.length, 0)
})

test('o rótulo da empresa vale também para a ferramenta', () => {
  const f = resolverFerramentas({ ...base, configDono: { labels: { '/check-imei': 'Consultar IMEI' } } })
  assert.equal(f.find((x) => x.href === '/check-imei')?.label, 'Consultar IMEI')
})
