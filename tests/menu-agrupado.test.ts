/**
 * MENU EM GRUPOS (navegação, 21/10/2026).
 *
 * O agrupamento só reparte a lista final do menu: nenhum segmento ou papel pode
 * ganhar, perder ou reordenar item por causa dele. A foto da cópia (script
 * comparar-menu-agrupado) só tem varejo; aqui passam todos os segmentos do código,
 * inclusive os extras (o Ranking da imobiliária declara o grupo antigo "Gestão").
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparMenu, resolverMenuAgrupado, resolverMenuPlano, GRUPO_DO_HREF, CATALOGO, type ResolverMenuInput } from '@/lib/menu'
import { SEGMENTOS, type Segmento } from '@/lib/segmentos'

const PAPEIS: Array<Pick<ResolverMenuInput, 'role' | 'isSuperAdmin'>> = [
  { role: 'owner', isSuperAdmin: false }, { role: 'admin', isSuperAdmin: false },
  { role: 'vendedor', isSuperAdmin: false }, { role: 'tecnico', isSuperAdmin: false },
  { role: 'owner', isSuperAdmin: true },
]

test('todo segmento e papel: mesmos itens, mesma ordem, no máximo 9 entradas', () => {
  for (const segmento of Object.keys(SEGMENTOS) as Segmento[]) {
    for (const p of PAPEIS) {
      const entrada: ResolverMenuInput = { segmento, plano: 'pro', ...p }
      const plano = resolverMenuPlano(entrada).map((i) => i.href)
      const grupos = resolverMenuAgrupado(entrada)
      const agrupado = grupos.flatMap((g) => g.itens.map((i) => i.href))
      const quem = `${segmento}/${p.isSuperAdmin ? 'superadmin' : p.role}`
      assert.deepEqual([...agrupado].sort(), [...plano].sort(), `${quem}: itens`)
      for (const g of grupos) {
        const pos = g.itens.map((i) => plano.indexOf(i.href))
        assert.deepEqual(pos, [...pos].sort((a, b) => a - b), `${quem}: ordem em ${g.label}`)
        assert.ok(g.itens.length > 0, `${quem}: ${g.label} vazio`)
      }
      assert.ok(grupos.length <= 9, `${quem}: ${grupos.length} entradas`)
    }
  }
})

test('o Ranking da imobiliária (extra, grupo antigo "Gestão") cai em Insights', () => {
  const grupos = resolverMenuAgrupado({ segmento: 'imobiliaria', role: 'owner', isSuperAdmin: false })
  const insights = grupos.find((g) => g.id === 'insights')
  assert.ok(insights?.itens.some((i) => i.href === '/ranking'))
})

test('todo item de menu do catálogo tem grupo declarado (nada cai no padrão por esquecimento)', () => {
  const semGrupo = CATALOGO.flatMap((g) => g.items).filter((i) => !i.ferramenta && !GRUPO_DO_HREF[i.href]).map((i) => i.href)
  assert.deepEqual(semGrupo, [])
})

test('a ordem dos grupos segue o primeiro item de cada um (quem arrastou o Chat para o topo vê Comunicação primeiro)', () => {
  const item = (href: string) => ({ href, label: href, icon: 'X', locked: false })
  const grupos = agruparMenu([item('/chat'), item('/dashboard'), item('/leads'), item('/tarefas')])
  assert.deepEqual(grupos.map((g) => g.id), ['comunicacao', 'inicio', 'pipeline'])
  assert.deepEqual(grupos[1].itens.map((i) => i.href), ['/dashboard', '/tarefas'])
})
