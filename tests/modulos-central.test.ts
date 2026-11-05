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
import { dependentesLigados, estadoDoModulo, requisitosDe, requisitosFaltando, tilesDaCentral, type EntradaCentral } from '@/lib/modulos-central'
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
  const base = hrefsHabilitados({ base: { habilitados: VAREJO } })
  assert.ok(!base.has('/gestao-leads'))
  const com = hrefsHabilitados({ base: { habilitados: VAREJO }, instalados: { '/gestao-leads': true, '/pdv': false } })
  assert.ok(com.has('/gestao-leads'))
  assert.ok(!com.has('/pdv'))
  // Núcleo e o que veio do /admin não saem nem desinstalados.
  const nucleo = hrefsLigados(['/pdv'], { '/dashboard': false, '/cadencias': false })
  assert.ok(nucleo.has('/dashboard') && nucleo.has('/cadencias'))
})

test('o menu reflete: Gestão de Leads instalada aparece, PDV desinstalado some', () => {
  const ent = { plano: 'pro', role: 'owner', isSuperAdmin: false, base: { habilitados: VAREJO } }
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
  const ent = { plano: 'pro', role: 'owner', isSuperAdmin: false, base: { habilitados: [...VAREJO, '/assistencia'] } }
  assert.deepEqual(resolverMenuPlano({ ...ent, instalados }), resolverMenuPlano(ent))
})

test('zero-segmento: ligadosDaEmpresa = a conta antiga; seções saem do módulo ligado', () => {
  const linhas: ModuloRow[] = [{ modulo: 'gestao_leads', ativo: true, config: {} }, { modulo: 'pdv', ativo: false, config: {} }]
  const cfg: ConfigEmpresa = {
    base: { habilitados: VAREJO, labelOverrides: {}, modulosExtra: [], menuLayout: {} }, telaInicial: null, vocabulario: {}, superadmin: { habilitados: ['/fila'] }, dono: undefined,
    modulos: linhas, forcados: undefined,
  }
  const antiga = hrefsHabilitados({ base: { habilitados: VAREJO }, overrides: { habilitados: ['/fila'] }, instalados: instaladosDoManifesto(linhas) })
  assert.deepEqual([...ligadosDaEmpresa(cfg)].sort(), [...antiga].sort())
  assert.deepEqual(abasDosModulos(new Set(['/imoveis', '/agenda'])).sort(), ['agendamento', 'portais'])
  assert.deepEqual(abasDosModulos(new Set(VAREJO)), [])
  assert.deepEqual([...ABAS_DE_MODULO].sort(), ['agendamento', 'cardapio', 'portais', 'veiculos-portais'])
})

test('dependências: requisitos transitivos, na ordem de instalar', () => {
  assert.deepEqual(requisitosDe(m('avaliacoes')).map((x) => x.chave), ['estoque', 'pdv'])
  assert.deepEqual(requisitosDe(m('pdv')).map((x) => x.chave), ['estoque'])
  assert.deepEqual(requisitosDe(m('assistencia')).map((x) => x.chave), ['estoque'])
  // Orçamentos não requer estoque (decisão do Lucas, 05/11/2026).
  assert.deepEqual(requisitosDe(m('orcamentos')), [])
  // Todo requisito do manifesto existe e não há ciclo (cada módulo não requer a si mesmo).
  for (const x of MODULOS) {
    for (const c of x.requer ?? []) assert.ok(moduloPorChave(c), `${x.chave} requer ${c}, fora do manifesto`)
    assert.ok(!requisitosDe(x).some((r) => r.chave === x.chave), `ciclo em ${x.chave}`)
  }
})

test('dependências: instalar liga junto, desinstalar requisito em uso bloqueia', () => {
  const semEstoque = entrada({ ligados: new Set(['/dashboard', '/leads']) })
  assert.deepEqual(estadoDoModulo(m('pdv'), semEstoque), { tipo: 'disponivel', junto: ['Estoque'] })
  assert.deepEqual(requisitosFaltando(m('pdv'), semEstoque).map((x) => x.chave), ['estoque'])
  assert.deepEqual(tilesDaCentral(semEstoque).find((x) => x.chave === 'assistencia')!.faltam, ['Estoque'])
  // Com o estoque ligado, nada vai junto.
  assert.deepEqual(estadoDoModulo(m('pdv'), entrada({ ligados: new Set(['/estoque']) })), { tipo: 'disponivel' })
  // Estoque com PDV e Assistência ligados: não sai, e diz quem usa.
  const usado = entrada({ ligados: new Set(['/estoque', '/pdv', '/assistencia']) })
  assert.deepEqual(estadoDoModulo(m('estoque'), usado), { tipo: 'instalado', podeDesinstalar: false, usadoPor: ['PDV', 'Assistência'] })
  assert.deepEqual(dependentesLigados(m('estoque'), usado).map((x) => x.chave), ['pdv', 'assistencia'])
  // Sem dependente ligado, sai normalmente.
  assert.deepEqual(estadoDoModulo(m('estoque'), entrada({ ligados: new Set(['/estoque']) })), { tipo: 'instalado', podeDesinstalar: true })
  // Transitivo: Avaliação ligada (sem PDV, estado legado) ainda segura o Estoque.
  assert.deepEqual(dependentesLigados(m('estoque'), entrada({ ligados: new Set(['/estoque', '/avaliacoes']) })).map((x) => x.chave), ['avaliacoes'])
})

test('dependências: requisito pago ou em preparação bloqueia com o motivo', () => {
  // Manifesto de mentira por cima do real: um módulo que requer Relatórios (bi) e outro que requer a Agenda.
  const fakeRel = { ...m('fila'), requer: ['relatorios'] }
  const e = entrada({ plano: 'free', ligados: new Set(['/dashboard']) })
  assert.deepEqual(estadoDoModulo(fakeRel, e), { tipo: 'disponivel', junto: ['Relatórios'], bloqueio: 'Precisa de Relatórios, que é no plano Starter: peça Relatórios primeiro.' })
  const fakeAgenda = { ...m('fila'), requer: ['agenda'] }
  assert.deepEqual(estadoDoModulo(fakeAgenda, e), { tipo: 'disponivel', junto: ['Agenda'], bloqueio: 'Precisa de Agenda, que ainda está em preparação.' })
})
