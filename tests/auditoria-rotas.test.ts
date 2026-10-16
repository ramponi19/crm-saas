/**
 * Auditoria de 16/10/2026 — rotas criadas depois da varredura de 18/08.
 *
 * Cada teste chama o handler de verdade (Next), com a sessão e o banco
 * simulados por `banco-falso`, e prova uma tranca que faltava: canal de outra
 * empresa, papel acima do próprio, perda sem motivo, planilha com fórmula,
 * cotação já usada, orçamento já aprovado, tabela de troca por vendedor.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { bancoFalso, filtro, type Consulta, type Responder } from './banco-falso'

type Db = ReturnType<typeof bancoFalso> & {
  auth: { getUser: () => Promise<unknown>; admin?: Record<string, (...a: unknown[]) => Promise<unknown>> }
}

const estado = {
  user: 'u-1' as string | null,
  empresa: 1,
  papel: 'owner' as string | null,
  responder: (() => ({ data: null, error: null })) as Responder,
  bancos: [] as Db[],
}

/** Todo cliente (sessão ou service role) lê do mesmo `responder` e fica guardado. */
function novo(): Db {
  const db = bancoFalso((c) => estado.responder(c)) as Db
  db.auth = {
    getUser: async () => ({ data: { user: estado.user ? { id: estado.user } : null } }),
    admin: {
      createUser: async () => ({ data: { user: { id: 'u-novo' } }, error: null }),
      deleteUser: async () => ({ error: null }),
    },
  } as Db['auth']
  estado.bancos.push(db)
  return db
}
const todas = (): Consulta[] => estado.bancos.flatMap((b) => b.consultas)
const ok = (data: unknown = null) => ({ data, error: null })

mock.module('@/lib/supabase/server', {
  namedExports: { createClient: async () => novo(), getEmpresaId: async () => estado.empresa },
})
mock.module('@/lib/supabase/service', { namedExports: { createServiceClient: () => novo() } })
mock.module('@/lib/limites', {
  namedExports: { verificarLimite: async () => ({ permitido: true, usoAtual: 0, limite: 0 }) },
})
mock.module('@/lib/owner', {
  namedExports: {
    requireOwnerOrAdminApi: async () => ({ userId: estado.user, empresaId: estado.empresa, role: 'owner', supabase: novo() }),
    requireEmpresaRoleApi: async () => ({ userId: estado.user, empresaId: estado.empresa, role: estado.papel, supabase: novo() }),
    getEmpresaRole: async () => estado.papel,
  },
})
mock.module('@/lib/automacoes', { namedExports: { executarEntradaEtapa: async () => {} } })
mock.module('@/lib/cadencia', { namedExports: { inscreverPorEtapa: async () => {} } })
mock.module('@/lib/troca-acesso', { namedExports: { cotacaoDeTrocaLiberada: async () => true } })
mock.module('@/lib/canais/crypto', { namedExports: { cifrarToken: (t: string) => `enc:${t}` } })
mock.module('@/lib/canais/meta', {
  namedExports: {
    metaConfigurada: () => true,
    ehErro: (x: unknown) => !!x && typeof x === 'object' && 'erro' in (x as object),
    trocarCodigoPorToken: async () => ({ token: 't' }),
    inspecionarToken: async () => ({ expiraEm: null, acessoDadosExpiraEm: null }),
    wabaDoToken: async () => 'waba-1',
    descobrirWhatsApp: async () => ({ erro: 'nao usado' }),
    numerosDaWaba: async () => ({ numeros: [] }),
    assinarWaba: async () => ({}),
    statusDoNumero: async () => ({ coexistencia: false, numero: null, nomeVerificado: null }),
    sincronizarAppDoCelular: async () => ({ requestId: 'r' }),
  },
})

const { POST: conectarWhatsApp } = await import('@/app/api/canais/whatsapp/route')
const { POST: criarUsuario } = await import('@/app/api/equipe/criar-usuario/route')
const { PATCH: atualizarUsuario } = await import('@/app/api/equipe/atualizar-usuario/route')
const { POST: moverLead } = await import('@/app/api/leads/mover/route')
const { GET: exportar } = await import('@/app/api/exportar/route')
const { POST: salvarCotacao, DELETE: apagarCotacao } = await import('@/app/api/troca/cotacoes/route')
const { POST: salvarPreco } = await import('@/app/api/troca/precos/route')
const { POST: salvarOrcamento } = await import('@/app/api/orcamentos/route')

const json = (url: string, corpo: unknown, method = 'POST') =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

beforeEach(() => {
  estado.user = 'u-1'; estado.empresa = 1; estado.papel = 'owner'; estado.bancos = []
  estado.responder = () => ok()
})

describe('canais: número já conectado em OUTRA empresa', () => {
  const corpo = { token: 'tok', wabaId: 'waba-1', phoneNumberId: 'num-da-vitima' }

  test('recusa com 409 e não grava nada no canal', async () => {
    estado.responder = (c) => c.tabela === 'canais_conectados' && c.op === 'select'
      ? ok({ id: 9, empresa_id: 2 })          // o número é da empresa 2
      : ok()
    const r = await conectarWhatsApp(json('http://x/api/canais/whatsapp', corpo))
    assert.equal(r.status, 409)
    assert.equal(todas().filter((c) => c.op === 'upsert' || c.op === 'update').length, 0)
  })

  test('reconexão do PRÓPRIO número continua passando', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'canais_conectados' && c.op === 'select') return ok({ id: 9, empresa_id: 1 })
      if (c.tabela === 'canais_conectados' && c.op === 'upsert') return ok({ id: 9 })
      return ok()
    }
    const r = await conectarWhatsApp(json('http://x/api/canais/whatsapp', corpo))
    assert.equal(r.status, 200)
    assert.equal(todas().filter((c) => c.op === 'upsert').length, 1)
  })
})

describe('equipe: ninguém concede papel do próprio nível', () => {
  const comPapel = (papel: string): Responder => (c) => {
    if (c.tabela === 'usuarios' && c.op === 'select' && String(c.dados).includes('is_super_admin')) return ok({ is_super_admin: false })
    if (c.tabela === 'empresa_usuarios' && c.op === 'select' && c.dados === 'role') return ok({ role: papel })
    return ok()
  }
  const novoUsuario = (role: string, email = 'nova@loja.com') =>
    json('http://x/api/equipe/criar-usuario', { nome: 'N', email, senha: '12345678', role })

  test('admin não cria admin (403) e não chega a criar ninguém', async () => {
    estado.responder = comPapel('admin')
    const r = await criarUsuario(novoUsuario('admin') as never)
    assert.equal(r.status, 403)
    assert.ok(!todas().some((c) => c.op === 'insert' || c.op === 'update'))
  })

  test('dono cria admin: passa da hierarquia', async () => {
    estado.responder = comPapel('owner')
    const r = await criarUsuario(novoUsuario('admin') as never)
    assert.notEqual(r.status, 403)
  })

  test('e-mail com coringa é recusado antes de consultar a plataforma', async () => {
    estado.responder = comPapel('owner')
    const r = await criarUsuario(novoUsuario('vendedor', 'a*@gmail.com') as never)
    assert.equal(r.status, 400)
    assert.ok(!todas().some((c) => c.tabela === 'usuarios' && filtro(c, 'ilike')))
  })

  test('sublinhado no e-mail é escapado no ilike (só vale ele mesmo)', async () => {
    estado.responder = comPapel('owner')
    await criarUsuario(novoUsuario('vendedor', 'joao_silva@x.com') as never)
    const busca = todas().find((c) => c.tabela === 'usuarios' && filtro(c, 'ilike'))
    assert.deepEqual(filtro(busca!, 'ilike'), ['email', 'joao\\_silva@x.com'])
  })

  test('admin não rebaixa outro admin', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'usuarios' && c.op === 'select') return ok({ is_super_admin: false })
      if (c.tabela === 'empresa_usuarios' && c.op === 'select' && c.dados === 'role') return ok({ role: 'admin' })
      if (c.tabela === 'empresa_usuarios' && c.op === 'select') return ok({ usuario_id: 'u-2', role: 'admin' })
      return ok()
    }
    const r = await atualizarUsuario(json('http://x/api/equipe/atualizar-usuario', { id: 'u-2', nome: 'B', role: 'vendedor' }, 'PATCH') as never)
    assert.equal(r.status, 403)
    assert.ok(!todas().some((c) => c.op === 'update'))
  })

  test('superadmin não deixa a empresa sem dono', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'usuarios' && c.op === 'select') return ok({ is_super_admin: true })
      if (c.tabela === 'empresa_usuarios' && c.op === 'select' && String(c.dados).includes('role')) return ok({ usuario_id: 'u-2', role: 'owner' })
      if (c.tabela === 'empresa_usuarios' && c.op === 'select') return { data: null, error: null, count: 0 } as never
      return ok()
    }
    const r = await atualizarUsuario(json('http://x/api/equipe/atualizar-usuario', { id: 'u-2', nome: 'B', role: 'admin' }, 'PATCH') as never)
    assert.equal(r.status, 409)
    assert.ok(!todas().some((c) => c.op === 'update'))
  })
})

describe('leads/mover: perda só com motivo; sair da perda limpa o rastro', () => {
  const etapas = [
    { slug: 'novo', tipo: 'negociacao', funil_id: 7 },
    { slug: 'perdido', tipo: 'perdido', funil_id: 7 },
  ]
  const banco = (lead: Record<string, unknown>, motivoDaEmpresa = true): Responder => (c) => {
    if (c.tabela === 'leads' && c.op === 'select') return ok({ id: 1, nome: 'L', responsavel_id: 'u-1', funil_id: 7, ...lead })
    if (c.tabela === 'funil_etapas') return ok(etapas)
    if (c.tabela === 'motivos_perda') return ok(motivoDaEmpresa ? { id: 3 } : null)
    return ok()
  }
  const update = () => todas().find((c) => c.tabela === 'leads' && c.op === 'update')

  test('perdido sem motivo: 400, nada gravado', async () => {
    estado.responder = banco({ kanban_status: 'novo' })
    const r = await moverLead(json('http://x/api/leads/mover', { leadId: 1, kanban_status: 'perdido' }))
    assert.equal(r.status, 400)
    assert.equal(update(), undefined)
  })

  test('motivo de outra empresa: 400', async () => {
    estado.responder = banco({ kanban_status: 'novo' }, false)
    const r = await moverLead(json('http://x/api/leads/mover', { leadId: 1, kanban_status: 'perdido', motivo_perda_id: 99 }))
    assert.equal(r.status, 400)
  })

  test('etapa que não existe no funil: 400', async () => {
    estado.responder = banco({ kanban_status: 'novo' })
    const r = await moverLead(json('http://x/api/leads/mover', { leadId: 1, kanban_status: 'etapa-de-outro-funil' }))
    assert.equal(r.status, 400)
  })

  test('voltar da perda zera motivo e data', async () => {
    estado.responder = banco({ kanban_status: 'perdido', motivo_perda_id: 3, perdido_em: '2026-10-01' })
    const r = await moverLead(json('http://x/api/leads/mover', { leadId: 1, kanban_status: 'novo' }))
    assert.equal(r.status, 200)
    const d = update()!.dados as Record<string, unknown>
    assert.equal(d.motivo_perda_id, null)
    assert.equal(d.perdido_em, null)
  })

  test('perda com motivo da empresa grava motivo e data', async () => {
    estado.responder = banco({ kanban_status: 'novo' })
    const r = await moverLead(json('http://x/api/leads/mover', { leadId: 1, kanban_status: 'perdido', motivo_perda_id: 3 }))
    assert.equal(r.status, 200)
    const d = update()!.dados as Record<string, unknown>
    assert.equal(d.motivo_perda_id, 3)
    assert.ok(d.perdido_em)
  })
})

describe('exportar: escopo do vendedor e planilha sem fórmula', () => {
  const banco = (papel: string, verLeadsOutros: boolean): Responder => (c) => {
    if (c.tabela === 'empresa_usuarios') return ok({ role: papel })
    if (c.tabela === 'empresas') return ok({ permissoes: { vendedor: { exportar: true, verLeadsOutros } } })
    if (c.tabela === 'leads') return ok([{ nome: '=HYPERLINK("http://x")', telefone: '+5511999', origem: 'wa' }])
    return ok()
  }

  test('vendedor sem "ver de outros" exporta só os leads dele', async () => {
    estado.responder = banco('vendedor', false)
    const r = await exportar(new Request('http://x/api/exportar?tipo=leads'))
    assert.equal(r.status, 200)
    const q = todas().find((c) => c.tabela === 'leads')!
    assert.ok(q.filtros.some((f) => f[0] === 'eq' && f[1] === 'responsavel_id' && f[2] === 'u-1'))
  })

  test('com "ver de outros" não filtra por pessoa', async () => {
    estado.responder = banco('vendedor', true)
    await exportar(new Request('http://x/api/exportar?tipo=leads'))
    const q = todas().find((c) => c.tabela === 'leads')!
    assert.ok(!q.filtros.some((f) => f[0] === 'eq' && f[1] === 'responsavel_id'))
  })

  test('célula que começa com = vira texto', async () => {
    estado.responder = banco('owner', true)
    const csv = await (await exportar(new Request('http://x/api/exportar?tipo=leads'))).text()
    assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`), csv)
    assert.ok(csv.includes(`'+5511999`))
  })
})

describe('troca: o que já foi usado não muda, e vendedor só preenche em branco', () => {
  test('cotação já usada numa venda: 409', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'troca_precos') return ok({ na_troca: 1000, descontos: {} })
      if (c.tabela === 'troca_regras') return ok({ bonus_seminovo: 0, corte_bateria: 80 })
      if (c.tabela === 'troca_cotacoes' && c.op === 'update') return ok(null)   // usada_em preenchido
      if (c.tabela === 'troca_cotacoes' && c.op === 'select') return ok({ id: 5 })
      return ok()
    }
    const r = await salvarCotacao(json('http://x/api/troca/cotacoes', { id: 5, modelo: 'iPhone 14', armazenamento: '128GB' }))
    assert.equal(r.status, 409)
    const upd = todas().find((c) => c.tabela === 'troca_cotacoes' && c.op === 'update')!
    assert.deepEqual(filtro(upd, 'is'), ['usada_em', null])
  })

  test('apagar exige cotação não usada', async () => {
    estado.responder = () => ok(null)
    const r = await apagarCotacao(new Request('http://x/api/troca/cotacoes?id=5', { method: 'DELETE' }))
    assert.equal(r.status, 409)
    const del = todas().find((c) => c.op === 'delete')!
    assert.ok(del.filtros.some((f) => f[0] === 'is' && f[1] === 'venda_id'))
  })

  test('vendedor não sobrescreve valor já preenchido', async () => {
    estado.papel = 'vendedor'
    estado.responder = (c) => c.tabela === 'troca_precos' && c.op === 'select'
      ? ok({ id: 1, na_troca: 1500, descontos: {} }) : ok()
    const r = await salvarPreco(json('http://x/api/troca/precos', { modelo: 'iPhone 14', armazenamento: '128GB', na_troca: 9999 }))
    assert.equal(r.status, 403)
    assert.ok(!todas().some((c) => c.op === 'update' || c.op === 'insert'))
  })

  test('vendedor preenche célula em branco', async () => {
    estado.papel = 'vendedor'
    estado.responder = (c) => c.tabela === 'troca_precos' && c.op === 'select'
      ? ok({ id: 1, na_troca: null, descontos: {} }) : ok()
    const r = await salvarPreco(json('http://x/api/troca/precos', { modelo: 'iPhone 14', armazenamento: '128GB', na_troca: 1500 }))
    assert.equal(r.status, 200)
  })
})

describe('orçamentos: aprovado não muda; lead de outra empresa não entra', () => {
  test('editar orçamento aprovado: 409', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'orcamentos' && c.op === 'update') return ok(null)
      if (c.tabela === 'orcamentos' && c.op === 'select') return ok({ aprovado_em: '2026-10-10' })
      return ok()
    }
    const r = await salvarOrcamento(json('http://x/api/orcamentos', { id: 8, cliente_nome: 'C', tipo: 'venda', itens: [] }))
    assert.equal(r.status, 409)
  })

  test('lead de outra empresa grava nulo e valores negativos viram zero', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'leads') return ok(null)                     // não é da empresa
      if (c.tabela === 'orcamentos' && c.op === 'insert') return ok({ id: 1, token: 't' })
      return ok()
    }
    const r = await salvarOrcamento(json('http://x/api/orcamentos', {
      cliente_nome: 'C', tipo: 'downgrade', lead_id: 555, valor_novo: -100, valor_entrada: -50, itens: [],
    }))
    assert.equal(r.status, 200)
    const ins = todas().find((c) => c.tabela === 'orcamentos' && c.op === 'insert')!.dados as Record<string, unknown>
    assert.equal(ins.lead_id, null)
    assert.equal(ins.valor_novo, 0)
    assert.equal(ins.valor_entrada, 0)
    assert.equal(ins.valor_devolver, 0)
  })
})
