/**
 * UPDATE DE 0 LINHAS É ERRO, NÃO "OK" (04/11/2026).
 *
 * Contato de uma loja, negócio na outra: a RLS barrava o UPDATE do contato sem erro
 * e a rota respondia ok — a justificativa da perda sumia (defeito nascido em
 * 682444f). Os dois caminhos que confirmam gravação ao usuário pedem as linhas de
 * volta e as conferem.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nadaGravado } from '@/lib/linhas-afetadas'

test('nada gravado: nulo, indefinido ou lista vazia', () => {
  assert.equal(nadaGravado(null), true)
  assert.equal(nadaGravado(undefined), true)
  assert.equal(nadaGravado([]), true)
  assert.equal(nadaGravado([{ id: 1 }]), false)
})

for (const arquivo of ['app/api/leads/mover/route.ts', 'lib/card-do-lead.ts']) {
  test(`${arquivo} confere as linhas de cada UPDATE em contatos e negocios`, () => {
    const src = readFileSync(arquivo, 'utf8')
    for (const t of ['contatos', 'negocios']) {
      // A instrução inteira (pode quebrar linha antes do .eq/.select), até o próximo comando.
      const updates = [...src.matchAll(new RegExp(`from\\('${t}'\\)\\s*\\.update\\([\\s\\S]*?(?=\\n\\s*(?:if|const|return|let|//|\\}))`, 'g'))].map((m) => m[0])
      assert.ok(updates.length > 0, `${arquivo}: nenhum UPDATE em ${t}`)
      for (const u of updates) assert.match(u, /\.select\('id'\)/, u)
    }
    assert.match(src, /nadaGravado\(/)
  })
}

test('mover grava a justificativa ANTES de mover o negócio', () => {
  const src = readFileSync('app/api/leads/mover/route.ts', 'utf8')
  assert.ok(src.indexOf("from('contatos').update") < src.indexOf("from('negocios').update(patch"))
})
