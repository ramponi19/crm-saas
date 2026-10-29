/**
 * As linhas de presets_onboarding como a migração 20261029000100 as grava — lidas
 * do próprio arquivo, para o teste não ter uma cópia que envelhece separada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { baseDoPreset } from '@/lib/presets'
import { camadasDoMenu, type ConfigEmpresa, type ModuloRow } from '@/lib/empresa-config'

const SQL = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261029000100_presets_completos.sql'), 'utf8')

export const PRESETS: Record<string, { rotulos: Record<string, unknown>; etapas: unknown[]; campos: unknown[] }> = {}
for (const m of SQL.matchAll(/rotulos = \$j\$(.*?)\$j\$::jsonb,\s*etapas = \$j\$(.*?)\$j\$::jsonb,\s*campos = \$j\$(.*?)\$j\$::jsonb,[\s\S]*?where chave = '(\w+)'/g)) {
  PRESETS[m[4]] = { rotulos: JSON.parse(m[1]), etapas: JSON.parse(m[2]), campos: JSON.parse(m[3]) }
}

/** A configuração de uma empresa recém-cadastrada com este preset (sem camadas por cima). */
export function empresaNascidaCom(chave: string, modulos: ModuloRow[] = []): ConfigEmpresa {
  const rows = modulos
  return { ...camadasDoMenu({ base: baseDoPreset(PRESETS[chave].rotulos) }), modulos: rows, forcados: undefined }
}
