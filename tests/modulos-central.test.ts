/**
 * CENTRAL DE MÓDULOS (22/10/2026).
 *
 * O estado de cada tile (lib/modulos-central.ts) e a camada "instalados" do menu
 * (lib/menu.ts `hrefsHabilitados`/`hrefsLigados`, lib/empresa-config.ts
 * `instaladosDoManifesto`): instalar liga, desinstalar tira, núcleo não sai, e as
 * linhas que o corte deixou em empresa_modulos não mudam o menu de hoje.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ABAS_DE_MODULO, MODULOS, abasDosModulos, moduloPorChave, moduloPorHref } from '@/core/modulos'
import { estadoDoModulo, tilesDaCentral, type EntradaCentral } from '@/lib/modulos-central'
import { CATALOGO, hrefsHabilitados, hrefsLigados, resolverMenuPlano } from '@/lib/menu'
import { instaladosDoManifesto, ligadosDaEmpresa, type ConfigEmpresa, type ModuloRow } from '@/lib/empresa-config'

const VAREJO = ['/dashboard', '/leads', '/clientes', '/tarefas', '/orcamentos', '/pdv', '/historico', '/estoque', '/catalogo', '/financeiro', '/relatorios']
const entrada = (e: Partial<EntradaCentral> = {}): EntradaCentral => ({ ligados: new Set(VAREJO), plano: 'pro', ativos: new Set(), ...e })
const m = (chave: string) => moduloPorChave(chave)!

test('manifesto: chave válida e única, endereço do menu', () => {
  const noMenu = new Set(CATALOGO.flatMap((g) => g.items).map((i) => i.href))
  const chaves = new Set<string>()
  for (const x of MODULOS) {
    assert.match(x.chave, /^[a-z][a-z0-9_]*$/, x.chave)
    assert.ok(!chaves.has(x.chave), `chave repetida ${x.chave}`); chaves.add(x.chave)
    // Só o contratado à parte (ZapIntel) não é item do menu.
    if (!x.addon) assert.ok(noMenu.has(x.href), `${x.href} não está no catálogo do menu`)
  }
  assert.equal(moduloPorHref('/gestao-leads')?.chave, 'gestao_leads')
})

test('estado: preparação, pago, instalado e disponível', () => {
  assert.deepEqual(estadoDoModulo(m('agenda'), entrada()), { tipo: 'preparacao' })
  assert.deepEqual(estadoDoModulo(m('pdv'), entrada()), { tipo: 'instalado', podeDesinstalar: true })
  assert.deepEqual(estadoDoModulo(m('gestao_leads'), entrada()), { tipo: 'disponivel' })
  // Relatórios é recurso 'bi': fora no plano free, dentro no starter/pro, e o forçado do superadmin vale.
  assert.deepEqual(estadoDoModulo(m('relatorios'), entrada({ plano: 'free' })), { tipo: 'pago', onde: 'no plano Starter' })
  assert.deepEqual(estadoDoModulo(m('relatorios'), entrada({ plano: 'free', forcados: { bi: true } })), { tipo: 'instalado', podeDesinstalar: true })
  // ZapIntel: contratado à parte, não se desinstala pela Central.
  assert.deepEqual(estadoDoModulo(m('inteligencia'), entrada()), { tipo: 'pago', onde: 'contratado à parte' })
  assert.deepEqual(estadoDoModulo(m('inteligencia'), entrada({ ativos: new Set(['inteligencia']) })), { tipo: 'instalado', podeDesinstalar: false })
  // O pedido em aberto chega ao tile.
  const t = tilesDaCentral(entrada({ plano: 'free', pedidos: { '/relatorios': '2026-10-22T10:00:00Z' } })).find((x) => x.chave === 'relatorios')!
  assert.equal(t.pedidoEm, '2026-10-22T10:00:00Z')
})

test('camada instalados: instalar liga, desinstalar tira, núcleo fica', () => {
  const base = hrefsHabilitados({ segmento: 'varejo', segOverride: { habilitados: VAREJO } })
  assert.ok(!base.has('/gestao-leads'))
  const com = hrefsHabilitados({ segmento: 'varejo', segOverride: { habilitados: VAREJO }, instalados: { '/gestao-leads': true, '/pdv': false } })
  assert.ok(com.has('/gestao-leads'))
  assert.ok(!com.has('/pdv'))
  // Núcleo e o que veio do /admin não saem nem desinstalados.
  const nucleo = hrefsLigados(['/pdv'], { '/dashboard': false, '/cadencias': false })
  assert.ok(nucleo.has('/dashboard') && nucleo.has('/cadencias'))
})

test('o menu reflete: Gestão de Leads instalada aparece, PDV desinstalado some', () => {
  const ent = { segmento: 'varejo' as const, plano: 'pro', role: 'owner', isSuperAdmin: false, segOverride: { habilitados: VAREJO } }
  const antes = resolverMenuPlano(ent).map((i) => i.href)
  const depois = resolverMenuPlano({ ...ent, instalados: { '/gestao-leads': true, '/pdv': false } }).map((i) => i.href)
  assert.ok(!antes.includes('/gestao-leads') && depois.includes('/gestao-leads'))
  assert.ok(antes.includes('/pdv') && !depois.includes('/pdv'))
})

test('as linhas do corte em empresa_modulos não mudam o menu de hoje', () => {
  // Exatamente o que JM e Preview têm em produção desde 20/10.
  const linhas: ModuloRow[] = ['assistencia', 'avaliacao', 'estoque', 'financeiro', 'inteligencia', 'vendas']
    .map((modulo) => ({ modulo, ativo: true, config: {} }))
  const instalados = instaladosDoManifesto(linhas)
  // Só o que é módulo de menu entra (vendas/avaliacao não; o ZapIntel não é item do menu).
  assert.deepEqual(Object.keys(instalados).sort(), ['/assistencia', '/estoque', '/financeiro', '/zapintel'])
  const ent = { segmento: 'varejo' as const, plano: 'pro', role: 'owner', isSuperAdmin: false, segOverride: { habilitados: [...VAREJO, '/assistencia'] } }
  assert.deepEqual(resolverMenuPlano({ ...ent, instalados }), resolverMenuPlano(ent))
})

test('zero-segmento: ligadosDaEmpresa = a conta antiga; seções saem do módulo ligado', () => {
  const linhas: ModuloRow[] = [{ modulo: 'gestao_leads', ativo: true, config: {} }, { modulo: 'pdv', ativo: false, config: {} }]
  const cfg: ConfigEmpresa = {
    preset: 'varejo', segOverride: { habilitados: VAREJO }, superadmin: { habilitados: ['/fila'] }, dono: undefined,
    modulos: linhas, forcados: undefined,
  }
  const antiga = hrefsHabilitados({ segmento: 'varejo', segOverride: { habilitados: VAREJO }, overrides: { habilitados: ['/fila'] }, instalados: instaladosDoManifesto(linhas) })
  assert.deepEqual([...ligadosDaEmpresa(cfg)].sort(), [...antiga].sort())
  assert.deepEqual(abasDosModulos(new Set(['/imoveis', '/agenda'])).sort(), ['agendamento', 'portais'])
  assert.deepEqual(abasDosModulos(new Set(VAREJO)), [])
  assert.deepEqual([...ABAS_DE_MODULO].sort(), ['agendamento', 'cardapio', 'portais', 'veiculos-portais'])
})
