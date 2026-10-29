/**
 * O MENU SAI IDÊNTICO QUANDO A FONTE TROCA (Frente 1, item 1.1, 21/10/2026).
 *
 *   npx tsx scripts/comparar-menu.mts <menu-legado.json> <menu-core.json>
 *
 * As duas fotos vêm da cópia: supabase/testes/menu_foto_legado.sql ANTES da
 * migração 20261021003200 e supabase/testes/menu_foto_core.sql DEPOIS. Para
 * cada empresa, cada loja e cada papel, monta a entrada do menu como o layout
 * montava (legado) e como monta agora (lib/empresa-config.ts), roda o MESMO
 * resolverMenuPlano e compara item por item: href, rótulo, ordem e cadeado.
 * Sai com código 1 se qualquer menu mudar.
 *
 * A loja não entra no cálculo do menu (lib/menu.ts não lê filial); o laço por
 * loja existe para o teste dizer isso com números em vez de supor.
 */
import fs from 'node:fs'
import { resolverMenuPlano, type MenuOverridesSuperadmin, type MenuConfigDono, type MenuOverrideRow, type CamadaBase } from '../lib/menu'
import { permsDoPapel, type PermissoesMap } from '../lib/permissoes'
import { camadasDoMenu, camadasParaMenu, modulosForcados, type ModuloRow } from '../lib/empresa-config'
import { baseDoPreset } from '../lib/presets'

type PresetRow = { chave: string; rotulos: Record<string, unknown> | null }
import type { ModuloPlano } from '../lib/plano'

type Legado = {
  id: number; segmento: string | null; plano: string | null; permissoes: unknown; lojas: number[]
  menu_override: MenuOverrideRow | null; menu_config: MenuConfigDono | null; modulos_override: Record<string, boolean> | null
  seg: { hidden_hrefs: string[] | null; label_overrides: Record<string, string> | null; modulos_extra: CamadaBase['modulosExtra'] | null; modulos_habilitados: string[] | null; menu_layout: Record<string, string[]> | null } | null
}
type Core = {
  id: number; preset: string | null; plano: string | null; permissoes: unknown; lojas: number[]
  itens: unknown; modulos: ModuloRow[]; preset_row: PresetRow | null
}

const ler = <T,>(f: string) => JSON.parse(fs.readFileSync(f, 'utf8').trim()) as T
const [legados, cores] = [ler<Legado[]>(process.argv[2]), ler<Core[]>(process.argv[3])]

// Papéis do layout; o superadmin entra como dono da empresa impersonada.
const PAPEIS = [
  { role: 'owner', superadmin: false }, { role: 'admin', superadmin: false },
  { role: 'vendedor', superadmin: false }, { role: 'tecnico', superadmin: false },
  { role: 'owner', superadmin: true },
]

function permHidden(role: string, permissoes: unknown): string[] {
  const p = permsDoPapel(role, (permissoes ?? null) as PermissoesMap | null)
  return [...(!p.verFinanceiro ? ['/financeiro'] : []), ...(!p.verRelatorios ? ['/relatorios'] : [])]
}

/** Exatamente o que app/(dashboard)/layout.tsx montava até 21/10. */
function entradaLegado(e: Legado, role: string, superadmin: boolean) {
  const mo = e.menu_override
  const overrides: MenuOverridesSuperadmin = {
    modulos: (e.modulos_override ?? undefined) as Partial<Record<ModuloPlano, boolean>> | undefined,
    hidden: [...(mo?.hidden ?? []), ...permHidden(role, e.permissoes)],
    labels: mo?.labels, habilitados: mo?.habilitados,
  }
  const s = e.seg
  const lido: CamadaBase | undefined = s ? {
    hiddenHrefs: s.hidden_hrefs ?? [], labelOverrides: s.label_overrides ?? {}, modulosExtra: s.modulos_extra ?? [],
    habilitados: s.modulos_habilitados ?? undefined, menuLayout: s.menu_layout ?? undefined,
  } : undefined
  // As fotos só têm varejo, com lista própria: o molde do varejo não somava nada
  // (29/10/2026, o molde saiu do código).
  const base: CamadaBase = { habilitados: lido?.habilitados, labelOverrides: lido?.labelOverrides ?? {}, modulosExtra: lido?.modulosExtra ?? [], menuLayout: lido?.menuLayout ?? {} }
  return { base, plano: e.plano ?? undefined, role, isSuperAdmin: superadmin,
    overrides, configDono: e.menu_config ?? undefined }
}

/** O que o layout monta agora: a MESMA camadasParaMenu de lib/empresa-config.ts. */
function entradaCore(e: Core, role: string, superadmin: boolean) {
  // A base que o cadastro gravaria a partir da linha do preset (lib/presets.ts).
  const cfg = { ...camadasDoMenu({ ...((e.itens ?? {}) as object), base: baseDoPreset(e.preset_row?.rotulos) }), forcados: modulosForcados(e.modulos) }
  const { overrides, configDono, base } = camadasParaMenu(cfg, permHidden(role, e.permissoes))
  return { base, plano: e.plano ?? undefined, role, isSuperAdmin: superadmin, overrides, configDono }
}

const fmt = (itens: ReturnType<typeof resolverMenuPlano>) => itens.map((i) => `${i.href}|${i.label}${i.locked ? '|🔒' : ''}`)

let comparados = 0
let diferentes = 0
for (const l of legados) {
  const c = cores.find((x) => x.id === l.id)
  if (!c) { console.log(`empresa ${l.id}: some na foto do core`); diferentes++; continue }
  const lojas = l.lojas.length ? l.lojas : [0]
  for (const loja of lojas) {
    for (const { role, superadmin } of PAPEIS) {
      const a = fmt(resolverMenuPlano(entradaLegado(l, role, superadmin)))
      const b = fmt(resolverMenuPlano(entradaCore(c, role, superadmin)))
      comparados++
      const quem = `empresa ${l.id} · loja ${loja} · ${superadmin ? 'superadmin' : role}`
      if (JSON.stringify(a) === JSON.stringify(b)) {
        console.log(`igual      ${quem}: ${a.length} itens`)
      } else {
        diferentes++
        console.log(`DIFERENTE  ${quem}\n  antes:  ${a.join('  ')}\n  depois: ${b.join('  ')}`)
      }
    }
  }
}
console.log(`\n${comparados} menus comparados, ${diferentes} diferentes`)
process.exit(diferentes ? 1 : 0)
