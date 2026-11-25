import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TODAS_AS_PERMISSOES, destinoSemEmpresa, permsDoContexto, temPermissao } from '@/lib/sessao'

// Etapa 1.1b (25/11/2026): regras puras do contexto da sessão.

test('as 6 permissões antigas vêm do cargo, com a mesma forma de lib/permissoes.ts', () => {
  assert.deepEqual(permsDoContexto({ papel: 'vendedor', permissoes: [] }), {
    verFinanceiro: false, verRelatorios: false, verLeadsOutros: false, verVendasOutros: false, excluir: false, exportar: false, descontoMax: 10,
  })
  assert.deepEqual(permsDoContexto({ papel: 'vendedor', permissoes: ['core.ver_leads_outros', 'core.ver_relatorios'] }), {
    verFinanceiro: false, verRelatorios: true, verLeadsOutros: true, verVendasOutros: false, excluir: false, exportar: false, descontoMax: 10,
  })
  const dono = permsDoContexto({ papel: 'owner', permissoes: [...TODAS_AS_PERMISSOES] })
  assert.equal(dono.verFinanceiro && dono.exportar && dono.excluir, true)
  assert.equal(permsDoContexto(null).exportar, false)
})

test('temPermissao: só o que está na lista; sem contexto, nada', () => {
  assert.equal(temPermissao({ permissoes: ['estoque.ver_custo'] }, 'estoque.ver_custo'), true)
  assert.equal(temPermissao({ permissoes: ['estoque.ver_custo'] }, 'equipe.cargos'), false)
  assert.equal(temPermissao(null, 'core.exportar'), false)
})

test('sem empresa resolvida: duas empresas pedem escolha; superadmin vai ao painel; sem vínculo, cadastro', () => {
  assert.equal(destinoSemEmpresa(null), '/login')
  assert.equal(destinoSemEmpresa({ superadmin: false, empresas: [{ id: 1, nome: 'A' }, { id: 5, nome: 'B' }] }), '/escolher-empresa')
  assert.equal(destinoSemEmpresa({ superadmin: true, empresas: [] }), '/superadmin')
  assert.equal(destinoSemEmpresa({ superadmin: false, empresas: [] }), '/register')
})

test('a lista de permissões do app é a mesma do catálogo da migração', () => {
  const sql = readFileSync('supabase/migrations/20261125000700_cargos_permissoes.sql', 'utf8')
  const bloco = sql.slice(sql.indexOf('insert into public.permissoes_catalogo'), sql.indexOf('on conflict (chave) do nothing'))
  const chaves = [...bloco.matchAll(/\('([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(chaves, [...TODAS_AS_PERMISSOES].sort())
})
