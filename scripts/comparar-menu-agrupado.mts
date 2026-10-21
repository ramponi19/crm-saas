/**
 * O MENU EM GRUPOS TEM OS MESMOS ITENS DO MENU PLANO, SÓ REAGRUPADOS (navegação, 21/10/2026).
 *
 *   npx tsx scripts/comparar-menu-agrupado.mts <menu-core.json> [--novos=/a,/b]
 *
 * A foto é a mesma do comparar-menu (supabase/testes/menu_foto_core.sql na
 * cópia). Para cada empresa, loja e papel — as 15 combinações —, monta a entrada
 * como o layout monta, roda `resolverMenuPlano` (a lista de sempre) e
 * `resolverMenuAgrupado` (a sidebar nova) e confere:
 *   1. os mesmos itens: href, rótulo e cadeado, nem um a mais nem a menos;
 *   2. dentro de cada grupo, a mesma ordem relativa da lista;
 *   3. no máximo 9 entradas de topo, nenhum grupo vazio.
 *
 * `--novos` lista hrefs que a mudança em teste ACRESCENTA de propósito (a A.2
 * traz Automações e Insights do /admin): eles podem aparecer no agrupado sem
 * existir na lista antiga, e o script os mostra à parte. Sai com 1 se algo mais
 * mudar.
 */
import fs from 'node:fs'
import { resolverMenuPlano, resolverMenuAgrupado, type ResolverMenuInput } from '../lib/menu'
import { normalizarSegmento } from '../lib/segmentos'
import { permsDoPapel, type PermissoesMap } from '../lib/permissoes'
import { camadasDoMenu, camadasParaMenu, modulosForcados, segOverrideDoPreset, type ModuloRow, type PresetRow } from '../lib/empresa-config'

type Core = {
  id: number; preset: string | null; plano: string | null; permissoes: unknown; lojas: number[]
  itens: unknown; modulos: ModuloRow[]; preset_row: PresetRow | null
}

const cores = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').trim()) as Core[]
const novos = new Set((process.argv.find((a) => a.startsWith('--novos='))?.slice(8) ?? '').split(',').filter(Boolean))
// A lista antiga é a de ANTES da mudança em teste: `ANTES_SEM` tira dela os hrefs novos
// (com --novos, o resolverMenuPlano de hoje já os conhece).
const PAPEIS = [
  { role: 'owner', superadmin: false }, { role: 'admin', superadmin: false },
  { role: 'vendedor', superadmin: false }, { role: 'tecnico', superadmin: false },
  { role: 'owner', superadmin: true },
]

function permHidden(role: string, permissoes: unknown): string[] {
  const p = permsDoPapel(role, (permissoes ?? null) as PermissoesMap | null)
  return [...(!p.verFinanceiro ? ['/financeiro'] : []), ...(!p.verRelatorios ? ['/relatorios'] : [])]
}

/** O que app/(dashboard)/layout.tsx monta (mesma conta do comparar-menu). */
function entrada(e: Core, role: string, superadmin: boolean): ResolverMenuInput {
  const { superadmin: mo, dono } = camadasDoMenu(e.itens)
  const cfg = { segOverride: segOverrideDoPreset(e.preset_row), superadmin: mo, dono, forcados: modulosForcados(e.modulos) }
  const { overrides, configDono, segOverride } = camadasParaMenu(cfg, permHidden(role, e.permissoes))
  return { segmento: normalizarSegmento(e.preset), plano: e.plano ?? undefined, role, isSuperAdmin: superadmin, overrides, configDono, segOverride }
}

const chave = (i: { href: string; label: string; locked: boolean }) => `${i.href}|${i.label}${i.locked ? '|🔒' : ''}`

let comparados = 0
let falhas = 0
for (const e of cores) {
  for (const loja of e.lojas.length ? e.lojas : [0]) {
    for (const { role, superadmin } of PAPEIS) {
      comparados++
      const quem = `empresa ${e.id} · loja ${loja} · ${superadmin ? 'superadmin' : role}`
      const ent = entrada(e, role, superadmin)
      const plano = resolverMenuPlano(ent).map(chave).filter((k) => !novos.has(k.split('|')[0]))
      const grupos = resolverMenuAgrupado(ent)
      const agrupado = grupos.flatMap((g) => g.itens.map(chave))
      const acrescentados = agrupado.filter((k) => novos.has(k.split('|')[0]))
      const doAntes = agrupado.filter((k) => !novos.has(k.split('|')[0]))

      const erros: string[] = []
      const faltam = plano.filter((k) => !doAntes.includes(k))
      const sobram = doAntes.filter((k) => !plano.includes(k))
      if (faltam.length) erros.push(`faltam ${faltam.join(' ')}`)
      if (sobram.length) erros.push(`sobram ${sobram.join(' ')}`)
      for (const g of grupos) {
        const ordemNaLista = g.itens.map(chave).filter((k) => plano.includes(k)).map((k) => plano.indexOf(k))
        if (ordemNaLista.some((v, i) => i > 0 && v < ordemNaLista[i - 1])) erros.push(`ordem trocada em ${g.label}`)
        if (!g.itens.length) erros.push(`grupo vazio ${g.label}`)
      }
      if (grupos.length > 9) erros.push(`${grupos.length} entradas de topo`)

      const desenho = grupos.map((g) => g.itens.length === 1 ? g.itens[0].label : `${g.label}[${g.itens.map((i) => i.label).join(', ')}]`).join('  ')
      if (erros.length) { falhas++; console.log(`DIFERENTE  ${quem}: ${erros.join('; ')}\n  ${desenho}`) }
      else console.log(`igual      ${quem}: ${plano.length} itens em ${grupos.length} entradas${acrescentados.length ? ` (+${acrescentados.length} novos: ${acrescentados.map((k) => k.split('|')[0]).join(' ')})` : ''}\n  ${desenho}`)
    }
  }
}
console.log(`\n${comparados} menus comparados, ${falhas} diferentes`)
process.exit(falhas ? 1 : 0)
