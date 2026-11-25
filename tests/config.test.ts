import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DEFINICOES_CONFIG, definicaoConfig, montarEnvelopes, resolverConfig } from '@/lib/config'

// Etapa 1.1a (25/11/2026): motor de configuração em empresa_config. Regras puras de lib/config.ts.

test('envelopes: uma linha de empresa e uma por loja viram {empresa, lojas} por chave', () => {
  const env = montarEnvelopes([
    { modulo: 'posvenda', chave: 'teto_diario', filial_id: null, valor: 30 },
    { modulo: 'posvenda', chave: 'teto_diario', filial_id: 3, valor: 10 },
    { modulo: 'core', chave: 'horario', filial_id: 6, valor: { semana: {} } },
  ])
  assert.deepEqual(env['posvenda.teto_diario'], { empresa: 30, lojas: { 3: 10 } })
  assert.deepEqual(env['core.horario'], { empresa: null, lojas: { 6: { semana: {} } } })
})

test('valor que vale: loja → empresa → padrão (o mesmo do config_valor_emp)', () => {
  const env = { empresa: 30, lojas: { 3: 10 } }
  assert.equal(resolverConfig(env, 3, 99), 10)
  assert.equal(resolverConfig(env, 6, 99), 30)
  assert.equal(resolverConfig(env, null, 99), 30)
  assert.equal(resolverConfig({ empresa: null, lojas: {} }, 3, 99), 99)
  assert.equal(resolverConfig(undefined, 3, undefined), null)
  // valor falso gravado na loja continua valendo (não cai na empresa)
  assert.equal(resolverConfig({ empresa: true, lojas: { 3: false } }, 3, true), false)
})

test('catálogo: o padrão do pós-venda é o mesmo de lib/posvenda/config.ts', () => {
  assert.equal(definicaoConfig('posvenda', 'teto_diario')?.padrao, 30)
  assert.equal(definicaoConfig('posvenda', 'teto_diario')?.escopo, 'empresa_ou_loja')
  assert.equal(definicaoConfig('posvenda', 'nps_limite_chamado')?.escopo, 'empresa')
  assert.equal(definicaoConfig('distribuicao', 'sem_dono')?.padrao, 'esteira')
})

// Toda chave lida ou gravada pelo código (config_valor / config_valor_emp / config_salvar, nas migrações e no
// app) tem de estar no catálogo. Chave nova sem definição = este teste falha no mesmo commit.
function arquivos(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('.')) continue
    if (statSync(p).isDirectory()) arquivos(p, ext, out)
    else if (ext.test(n)) out.push(p)
  }
  return out
}

test('catálogo cobre toda chave usada no código e nas migrações', () => {
  const usadas = new Set<string>()
  const sql = /config_valor(?:_emp)?\([^)]*?'([a-z_]+)',\s*'([a-z_]+)'/g
  const ts = /p_modulo:\s*'([a-z_]+)',\s*p_chave:\s*'([a-z_]+)'/g
  for (const f of arquivos('supabase/migrations', /\.sql$/)) for (const m of readFileSync(f, 'utf8').matchAll(sql)) usadas.add(`${m[1]}.${m[2]}`)
  for (const d of ['app', 'lib', 'components']) {
    for (const f of arquivos(d, /\.tsx?$/)) for (const m of readFileSync(f, 'utf8').matchAll(ts)) usadas.add(`${m[1]}.${m[2]}`)
  }
  const catalogo = new Set(DEFINICOES_CONFIG.map((d) => `${d.modulo}.${d.chave}`))
  const faltam = [...usadas].filter((k) => !catalogo.has(k) && !k.startsWith('core.teste'))
  assert.deepEqual(faltam, [])
  assert.ok(usadas.size >= 10, `achou só ${usadas.size} chaves; a busca quebrou?`)
})
