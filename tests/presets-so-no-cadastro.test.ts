/**
 * O PRESET SÓ VALE NO CADASTRO (29/10/2026).
 *
 * presets_onboarding é a ficha de partida: o /register a copia para a empresa
 * (lib/presets.ts → aplicarPreset) e, dali em diante, tela nenhuma pergunta qual
 * foi o preset. Quem lê a tabela, ou importa lib/presets, está numa das duas
 * portas: o cadastro e as ferramentas de preset do superadmin (tela de presets,
 * preview, laboratório, métricas). Arquivo novo nesta lista é tela voltando a
 * depender de quem a empresa é — o certo é ler a empresa (lib/empresa-config.ts).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = process.cwd()
const PASTAS = ['app', 'components', 'lib', 'core', 'hooks']

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : []
  })
}

const TODOS = [...PASTAS.flatMap((p) => arquivos(path.join(RAIZ, p))), path.join(RAIZ, 'proxy.ts')]
  .map((p) => path.relative(RAIZ, p).split(path.sep).join('/'))
const quem = (re: RegExp) => TODOS.filter((f) => re.test(fs.readFileSync(path.join(RAIZ, f), 'utf8'))).sort()

test('só o cadastro e as ferramentas de preset do superadmin leem presets_onboarding', () => {
  assert.deepEqual(quem(/from\(\s*['"]presets_onboarding['"]\s*\)/), [
    'app/api/superadmin/presets/route.ts',
    'app/superadmin/laboratorio/page.tsx',
    'app/superadmin/presets/page.tsx',
    'lib/presets.ts',
  ])
})

test('só o cadastro e as ferramentas de preset do superadmin usam lib/presets', () => {
  assert.deepEqual(quem(/from\s+['"]@\/lib\/presets['"]/), [
    'app/api/register/route.ts',
    'app/api/superadmin/presets/[chave]/preview/route.ts',
    'app/api/superadmin/presets/route.ts',
    'app/register/page.tsx',
    'app/superadmin/laboratorio/page.tsx',
    'app/superadmin/metricas/page.tsx',
    'app/superadmin/presets/page.tsx',
    'lib/superadmin-preview.ts',
  ])
})

test('o molde por vertical não volta', () => {
  assert.equal(fs.existsSync(path.join(RAIZ, 'lib/segmentos.ts')), false)
  assert.deepEqual(quem(/['"]@\/lib\/segmentos['"]/), [])
})
