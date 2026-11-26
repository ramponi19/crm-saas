/** A marca de leitura protegida do catálogo (lib/config.ts) é igual à semente da tabela config_chave_leitura (H2). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LEITURA_PROTEGIDA, permissaoDeLeitura } from '@/lib/config'

test('config_chave_leitura (migração H2) = LEITURA_PROTEGIDA do catálogo', () => {
  const sql = readFileSync('supabase/migrations/20261126001300_h2_config_leitura_protegida.sql', 'utf8')
  const linha = sql.match(/insert into public\.config_chave_leitura[^;]*values\s*([^;]*?)\s*on conflict/i)?.[1] ?? ''
  const pares = Object.fromEntries([...linha.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)].map((m) => [m[1], m[2]]))
  assert.deepEqual(pares, LEITURA_PROTEGIDA)
})

test('precificação exige ver o custo; chave comum é livre', () => {
  assert.equal(permissaoDeLeitura('precificacao', 'margem_padrao'), 'estoque.ver_custo')
  assert.equal(permissaoDeLeitura('core', 'horario'), null)
})
