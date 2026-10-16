/**
 * Os scripts .mts compilam (17/10/2026). O tsconfig.json principal não os
 * inclui — e o next build também não —, então um script quebrado passava
 * calado: foi assim que `calibrar-zapintel.mts` ficou lendo campos que não
 * existem mais. Os quebrados conhecidos estão excluídos em
 * tsconfig.scripts.json e marcados no cabeçalho.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

test('tsc -p tsconfig.scripts.json: os scripts .mts compilam', () => {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.scripts.json'], { encoding: 'utf8', timeout: 240_000 })
  assert.equal(r.status, 0, `tsc falhou:\n${(r.stdout || '') + (r.stderr || '')}`.slice(0, 3000))
})
