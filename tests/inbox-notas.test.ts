/**
 * NOTA INTERNA EDITÁVEL E APAGÁVEL PELO AUTOR (decisão do Lucas, 04/11/2026).
 *
 * A migração 20261104000400 abre UPDATE e DELETE de `eventos` só para a nota
 * ('conversa.nota') e só para quem a escreveu; o resto de `eventos` continua
 * imutável. E a nota precisa nascer com o autor verdadeiro. A tela pede as linhas
 * de volta: nota de outra pessoa vira erro, nunca "ok".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migracao = readFileSync('supabase/migrations/20261104000400_eventos_nota_do_autor.sql', 'utf8')
const semComentario = migracao.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

test('migração: update e delete só da nota e só do autor, na empresa', () => {
  for (const cmd of ['update', 'delete']) {
    const bloco = semComentario.split(`create policy eventos_${cmd}`)[1]?.split(';')[0] ?? ''
    assert.match(bloco, new RegExp(`for ${cmd} to authenticated`), cmd)
    assert.match(bloco, /tipo = 'conversa\.nota'/, `${cmd}: só a nota`)
    assert.match(bloco, /por_usuario = \(select auth\.uid\(\)\)/, `${cmd}: só o autor`)
    assert.match(bloco, /empresa_id = \(select get_empresa_id\(\)\)/, `${cmd}: só a empresa`)
  }
  // o update também confere depois (with check): ninguém troca o autor nem o tipo.
  assert.match(semComentario.split('create policy eventos_update')[1].split(';')[0], /with check/)
})

test('migração: a nota nasce com o autor verdadeiro; os outros eventos como antes', () => {
  const insert = semComentario.split('create policy eventos_insert')[1]?.split(';')[0] ?? ''
  assert.match(insert, /empresa_id = \(select get_empresa_id\(\)\)/)
  assert.match(insert, /tipo <> 'conversa\.nota' or por_usuario = \(select auth\.uid\(\)\)/)
})

test('editar e apagar a nota conferem as linhas gravadas', () => {
  const src = readFileSync('lib/inbox/consultas.ts', 'utf8')
  for (const fn of ['editarNota', 'apagarNota']) {
    const corpo = src.split(`export async function ${fn}`)[1]?.split('\n}\n')[0] ?? ''
    assert.match(corpo, /\.select\('id'\)/, `${fn} pede as linhas`)
    assert.match(corpo, /nadaGravado\(data\)/, `${fn} confere`)
  }
})

test('só o autor vê Editar e Apagar na tela', () => {
  const src = readFileSync('components/modules/comunicacao/conversa-painel.tsx', 'utf8')
  assert.match(src, /minha=\{i\.n\.por_usuario === meuId\}/)
  assert.match(src, /\{minha && !editando && \(/)
})
