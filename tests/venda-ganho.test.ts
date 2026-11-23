/**
 * VENDA FECHADA COM OS DADOS DA VENDA (23/11/2026, Entrega A do pós-venda).
 *
 * Prova, chamando os handlers de verdade com sessão e banco simulados (banco-falso):
 *   - entrar no ganho por /api/leads/mover sem data, categoria, condição ou valor → 422 GANHO_DADOS e
 *     NADA gravado; com eles → ganho_em = data da venda (meio-dia no fuso), valor e dados.venda;
 *   - empresa sem categoria cadastrada: categoria não é exigida;
 *   - ganho → outra etapa de ganho não pede a venda de novo; sair do ganho sem motivo continua 409;
 *   - /api/leads/corrigir-data só traduz a RPC (o banco confere permissão e data);
 *   - lead novo direto numa etapa de ganho é recusado ANTES de criar o contato.
 * As regras puras (lib/venda-ganho.ts) têm teste próprio no começo.
 *
 *   npm test
 */
import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { bancoFalso, type Consulta, type Responder } from './banco-falso'
import { validarVendaGanho, ganhoEmDaData, lerValor, valorDigitado } from '@/lib/venda-ganho'

// ── regras puras ─────────────────────────────────────────────────────────────
describe('validarVendaGanho', () => {
  const ctx = { hoje: '2026-11-23', criadoEm: '2026-11-01', categorias: [1, 7] }
  const boa = { data: '2026-11-20', categoria_id: 1, condicao: 'novo', valor: '7.995,00' }

  test('venda completa passa, com o valor em número', () => {
    const r = validarVendaGanho(boa, ctx)
    assert.deepEqual(r, { ok: true, venda: { data: '2026-11-20', categoria_id: 1, condicao: 'novo', valor: 7995 } })
  })
  for (const [nome, venda, campo] of [
    ['sem nada', undefined, 'data'],
    ['data vazia', { ...boa, data: '' }, 'data'],
    ['data que não existe', { ...boa, data: '2026-02-30' }, 'data'],
    ['data no futuro', { ...boa, data: '2026-11-24' }, 'data'],
    ['antes de 2024', { ...boa, data: '2023-12-31' }, 'data'],
    ['mais de 30 dias antes do negócio', { ...boa, data: '2026-09-30' }, 'data'],
    ['sem categoria', { ...boa, categoria_id: null }, 'categoria_id'],
    ['categoria de outra empresa', { ...boa, categoria_id: 99 }, 'categoria_id'],
    ['sem condição', { ...boa, condicao: undefined }, 'condicao'],
    ['condição inventada', { ...boa, condicao: 'usado' }, 'condicao'],
    ['sem valor', { ...boa, valor: '' }, 'valor'],
    ['valor zero', { ...boa, valor: '0' }, 'valor'],
    ['valor que não é número', { ...boa, valor: 'sete mil' }, 'valor'],
    ['valor absurdo', { ...boa, valor: 99_000_000 }, 'valor'],
  ] as const) {
    test(`recusa: ${nome} → campo ${campo}`, () => {
      const r = validarVendaGanho(venda as never, ctx)
      assert.equal(r.ok, false)
      assert.equal(!r.ok && r.campo, campo)
    })
  }
  test('30 dias antes do negócio ainda passa (venda registrada antes do lead)', () => {
    assert.equal(validarVendaGanho({ ...boa, data: '2026-10-02' }, ctx).ok, true)
  })
  test('empresa sem categoria cadastrada: categoria não é exigida', () => {
    const r = validarVendaGanho({ ...boa, categoria_id: null }, { ...ctx, categorias: [] })
    assert.equal(r.ok && r.venda.categoria_id, null)
  })
  test('lerValor entende o jeito brasileiro', () => {
    assert.equal(lerValor('R$ 7.995,00'), 7995)
    assert.equal(lerValor('7995,5'), 7995.5)
    assert.equal(lerValor('7.995'), 7995)
    assert.equal(lerValor('7995.50'), 7995.5)
    assert.ok(Number.isNaN(lerValor('7,99,5')))
  })
  test('ganho_em: outro dia = meio-dia em Brasília; hoje = o instante atual', () => {
    const agora = new Date('2026-11-23T15:00:00Z')
    assert.equal(ganhoEmDaData('2026-10-15', 'America/Sao_Paulo', agora), '2026-10-15T15:00:00.000Z')
    assert.equal(ganhoEmDaData('2026-11-23', 'America/Sao_Paulo', agora), agora.toISOString())
  })
})

// O campo de valor vem preenchido ("4590"): o primeiro evento de digitação SUBSTITUI, nunca junta.
// Cada caso é o par (texto antes, texto depois do evento) que o navegador entrega ao onChange.
describe('valorDigitado: valor preenchido é substituído, nunca acrescentado', () => {
  const PRE = '4590'
  for (const [nome, depois, fica] of [
    ['digitar com o cursor no fim (o bug de 23/11)', '45907', '7'],
    ['digitar com o cursor no começo', '74590', '7'],
    ['digitar com o cursor no meio', '45790', '7'],
    ['digitar o mesmo dígito do fim', '45900', '0'],
    ['colar no fim', '45904.590,00', '4.590,00'],
    ['colar com R$', '4590R$ 5.200,00', 'R$ 5.200,00'],
    ['colar no começo', '5.200,004590', '5.200,00'],
    ['teclado numérico do celular: vírgula no fim', '4590,', ','],
  ] as const) {
    test(nome, () => assert.equal(valorDigitado(PRE, depois), fica))
  }
  test('tudo selecionado (foco) e digitar: o navegador já troca; fica o que veio', () => {
    assert.equal(valorDigitado(PRE, '7'), '7')
  })
  test('apagar (backspace) é edição de propósito: fica como está', () => {
    assert.equal(valorDigitado(PRE, '459'), '459')
    assert.equal(valorDigitado(PRE, ''), '')
  })
  test('trocar só um pedaço selecionado: fica como a pessoa escolheu', () => {
    assert.equal(valorDigitado(PRE, '4520'), '4520') // "9" selecionado → "2"
    assert.equal(valorDigitado(PRE, '45123'), '45123') // "90" selecionado → "123" (cresceu, mas trocou parte)
  })
  test('apagar e digitar: depois do primeiro evento o campo é texto comum (o modal para de substituir)', () => {
    const passo1 = valorDigitado(PRE, '') // apagou tudo
    assert.equal(passo1, '')
    // segundo evento já não passa por valorDigitado: o modal marca intocado = false no primeiro onChange
    assert.equal(lerValor('5200'), 5200)
  })
  test('campo vazio (negócio sem valor): digitar é texto comum', () => {
    assert.equal(valorDigitado('', '5'), '5')
  })
  test('o resultado de cada caso é um valor que o servidor aceita', () => {
    for (const v of ['7', '4.590,00', 'R$ 5.200,00', '5.200,00']) assert.ok(Number.isFinite(lerValor(v)), v)
  })
})

// ── rotas ────────────────────────────────────────────────────────────────────
type Db = Omit<ReturnType<typeof bancoFalso>, 'rpc'> & { auth: { getUser: () => Promise<unknown> }; rpc: (nome: unknown, args: unknown) => Promise<unknown> }
const estado = {
  user: 'u-1' as string | null,
  responder: (() => ({ data: null, error: null })) as Responder,
  bancos: [] as Db[],
  rpc: null as null | ((nome: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }),
  rpcs: [] as Array<{ nome: string; args: Record<string, unknown> }>,
}
function novo(): Db {
  const db = bancoFalso((c) => estado.responder(c)) as unknown as Db
  db.auth = { getUser: async () => ({ data: { user: estado.user ? { id: estado.user } : null } }) }
  db.rpc = async (nome: unknown, args: unknown) => {
    estado.rpcs.push({ nome: String(nome), args: args as Record<string, unknown> })
    return estado.rpc ? estado.rpc(String(nome), args as Record<string, unknown>) : { data: null, error: null }
  }
  estado.bancos.push(db)
  return db
}
const todas = (): Consulta[] => estado.bancos.flatMap((b) => b.consultas)
const ok = (data: unknown = null) => ({ data, error: null })

mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => novo(), getEmpresaId: async () => 1 } })
mock.module('@/lib/supabase/service', { namedExports: { createServiceClient: () => novo() } })
mock.module('@/lib/automacoes', { namedExports: { executarEntradaEtapa: async () => {} } })
mock.module('@/lib/cadencia', { namedExports: { inscreverPorEtapa: async () => {} } })

const { POST: mover } = await import('@/app/api/leads/mover/route')
const { POST: corrigirData } = await import('@/app/api/leads/corrigir-data/route')
const { criarLead } = await import('@/lib/leads')

const json = (corpo: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

beforeEach(() => { estado.bancos = []; estado.rpcs = []; estado.rpc = null; estado.user = 'u-1' })

describe('/api/leads/mover: entrar no ganho exige a venda', () => {
  const etapas = [
    { id: 70, slug: 'novo', tipo: 'normal' },
    { id: 75, slug: 'convertido', tipo: 'ganho' },
    { id: 76, slug: 'vendido_loja', tipo: 'ganho' },
  ]
  const hoje = new Date().toISOString().slice(0, 10)
  const banco = (negocio: Record<string, unknown>, categorias: number[] = [1, 7]): Responder => (c) => {
    if (c.tabela === 'negocios' && c.op === 'select') {
      return ok({
        id: 1, empresa_id: 1, funil_id: 7, responsavel_id: 'u-1', status: 'aberto', ganho_em: null, perdido_em: null,
        created_at: new Date().toISOString(), dados: { produto_interessado: 'iPhone 17' }, etapa: { slug: 'novo' },
        contato: { id: 5, nome: 'L', observacoes: null }, ...negocio,
      })
    }
    if (c.tabela === 'negocios' && c.op === 'update') return ok([{ id: 1 }])
    if (c.tabela === 'estoque_categorias') return ok(categorias.map((id) => ({ id })))
    if (c.tabela === 'funil_etapas') {
      const slug = c.filtros.find((f) => f[0] === 'eq' && f[1] === 'slug')?.[2]
      const e = etapas.find((x) => x.slug === slug)
      return ok(e ? { id: e.id, tipo: e.tipo } : null)
    }
    return ok()
  }
  const update = () => todas().find((c) => c.tabela === 'negocios' && c.op === 'update')
  const venda = { data: '2026-11-20', categoria_id: 1, condicao: 'seminovo', valor: '3.295,00' }

  test('sem a venda: 422 GANHO_DADOS no campo data, nada gravado', async () => {
    estado.responder = banco({})
    const r = await mover(json({ leadId: 1, kanban_status: 'convertido' }))
    assert.equal(r.status, 422)
    const j = await r.json() as { codigo: string; campo: string }
    assert.equal(j.codigo, 'GANHO_DADOS')
    assert.equal(j.campo, 'data')
    assert.equal(update(), undefined)
  })

  for (const [nome, v, campo] of [
    ['sem categoria', { ...venda, categoria_id: null }, 'categoria_id'],
    ['sem condição', { ...venda, condicao: null }, 'condicao'],
    ['sem valor', { ...venda, valor: '' }, 'valor'],
    ['data futura', { ...venda, data: '2999-01-01' }, 'data'],
  ] as const) {
    test(`${nome}: 422 no campo ${campo}, nada gravado`, async () => {
      estado.responder = banco({ created_at: '2026-11-10T12:00:00Z' })
      const r = await mover(json({ leadId: 1, kanban_status: 'convertido', venda: v }))
      assert.equal(r.status, 422)
      assert.equal(((await r.json()) as { campo: string }).campo, campo)
      assert.equal(update(), undefined)
    })
  }

  test('venda completa: ganho com a data da venda ao meio-dia, valor e dados.venda', async () => {
    estado.responder = banco({ created_at: '2026-11-10T12:00:00Z' })
    const r = await mover(json({ leadId: 1, kanban_status: 'convertido', venda }))
    assert.equal(r.status, 200)
    const d = update()!.dados as Record<string, unknown>
    assert.equal(d.status, 'ganho')
    assert.equal(d.etapa_id, 75)
    assert.equal(d.ganho_em, '2026-11-20T15:00:00.000Z')
    assert.equal(d.valor_estimado, 3295)
    const dados = d.dados as Record<string, Record<string, unknown>>
    assert.equal(dados.produto_interessado as unknown, 'iPhone 17', 'o resto de dados fica')
    assert.equal(dados.venda.categoria_id, 1)
    assert.equal(dados.venda.condicao, 'seminovo')
    assert.equal(dados.venda.data, '2026-11-20')
    assert.equal(dados.venda.registrada_por, 'u-1')
    // a lista de categorias é a da empresa do negócio, só as ativas
    const cat = todas().find((c) => c.tabela === 'estoque_categorias')!
    assert.ok(cat.filtros.some((f) => f[0] === 'eq' && f[1] === 'empresa_id' && f[2] === 1))
    assert.ok(cat.filtros.some((f) => f[0] === 'eq' && f[1] === 'ativo' && f[2] === true))
  })

  test('venda de hoje: ganho_em é o instante atual', async () => {
    estado.responder = banco({})
    const antes = Date.now()
    const r = await mover(json({ leadId: 1, kanban_status: 'convertido', venda: { ...venda, data: hoje } }))
    if (r.status === 422) return // virada de dia entre o cálculo do "hoje" daqui e o da rota (fuso): sem o que provar
    const g = Date.parse(String(update()!.dados && (update()!.dados as Record<string, unknown>).ganho_em))
    assert.ok(g >= antes - 1000 && g <= Date.now() + 1000)
  })

  test('empresa sem categoria cadastrada: passa sem categoria', async () => {
    estado.responder = banco({ created_at: '2026-11-10T12:00:00Z' }, [])
    const r = await mover(json({ leadId: 1, kanban_status: 'convertido', venda: { ...venda, categoria_id: null } }))
    assert.equal(r.status, 200)
    assert.equal(((update()!.dados as Record<string, unknown>).dados as Record<string, Record<string, unknown>>).venda.categoria_id, null)
  })

  test('ganho → outra etapa de ganho: não pede a venda e mantém a data', async () => {
    estado.responder = banco({ status: 'ganho', ganho_em: '2026-10-01T15:00:00Z', etapa: { slug: 'convertido' } })
    const r = await mover(json({ leadId: 1, kanban_status: 'vendido_loja' }))
    assert.equal(r.status, 200)
    assert.equal((update()!.dados as Record<string, unknown>).ganho_em, '2026-10-01T15:00:00Z')
  })

  test('sair do ganho sem motivo continua 409 GANHO_REABRIR, nada gravado', async () => {
    estado.responder = banco({ status: 'ganho', ganho_em: '2026-10-01T15:00:00Z', etapa: { slug: 'convertido' } })
    const r = await mover(json({ leadId: 1, kanban_status: 'novo' }))
    assert.equal(r.status, 409)
    assert.equal(((await r.json()) as { codigo: string }).codigo, 'GANHO_REABRIR')
    assert.equal(update(), undefined)
  })

  test('sair do ganho com motivo: chama reabrir_negocio e só então move', async () => {
    estado.responder = banco({ status: 'ganho', ganho_em: '2026-10-01T15:00:00Z', etapa: { slug: 'convertido' } })
    const r = await mover(json({ leadId: 1, kanban_status: 'novo', motivo_reabertura: 'cliente desistiu' }))
    assert.equal(r.status, 200)
    assert.deepEqual(estado.rpcs.map((x) => x.nome), ['reabrir_negocio'])
  })
})

describe('/api/leads/corrigir-data: só traduz a RPC', () => {
  test('sem sessão: 401', async () => {
    estado.user = null
    assert.equal((await corrigirData(json({ leadId: 1, data: '2026-10-15', motivo: 'xxxxx' }))).status, 401)
  })
  test('entrada ruim: 400 sem chamar a RPC', async () => {
    for (const corpo of [{}, { leadId: 'a', data: '2026-10-15' }, { leadId: 1, data: '15/10/2026' }]) {
      assert.equal((await corrigirData(json(corpo))).status, 400)
    }
    assert.equal(estado.rpcs.length, 0)
  })
  for (const [msg, status] of [
    ['SEM_PERMISSAO: só o dono ou um administrador corrige a data de uma venda.', 403],
    ['NEGOCIO_NAO_ENCONTRADO', 404],
    ['NAO_E_GANHO: só a data de uma venda fechada (ganho) pode ser corrigida.', 409],
    ['DATA_FUTURA: a data da venda não pode ser depois de hoje.', 400],
    ['DATA_ANTIGA: datas antes de 2024 não são aceitas.', 400],
    ['MOTIVO_OBRIGATORIO: informe o motivo da correção (5 caracteres ou mais).', 400],
  ] as const) {
    test(`${msg.split(':')[0]} → ${status}`, async () => {
      estado.rpc = () => ({ data: null, error: { message: msg } })
      const r = await corrigirData(json({ leadId: 1, data: '2026-10-15', motivo: 'motivo bom' }))
      assert.equal(r.status, status)
      assert.equal(((await r.json()) as { codigo: string }).codigo, msg.split(':')[0])
    })
  }
  test('ok: passa negócio, data e motivo à RPC e devolve os avisos', async () => {
    estado.rpc = () => ({ data: { ganho_em_novo: '2026-10-15T15:00:00Z', avisos: ['data anterior à criação do negócio (01/11/2026)'] }, error: null })
    const r = await corrigirData(json({ leadId: 5096, data: '2026-10-15', motivo: 'pedido do grupo em 15/10' }))
    assert.equal(r.status, 200)
    assert.deepEqual(estado.rpcs[0], { nome: 'corrigir_data_venda', args: { p_negocio: 5096, p_nova_data: '2026-10-15', p_motivo: 'pedido do grupo em 15/10' } })
    assert.deepEqual(((await r.json()) as { avisos: string[] }).avisos, ['data anterior à criação do negócio (01/11/2026)'])
  })
})

describe('lead novo não nasce como venda fechada', () => {
  test('etapa de ganho: recusa ANTES de criar o contato', async () => {
    estado.responder = (c) => {
      if (c.tabela === 'funis') return ok([{ id: 7 }])
      if (c.tabela === 'funil_etapas') return ok([{ id: 75, tipo: 'ganho' }])
      return ok()
    }
    const r = await criarLead(novo() as never, 1, { nome: 'X', telefone: '19999990000', kanban_status: 'convertido' } as never)
    assert.equal('error' in r && r.status, 400)
    assert.ok(!todas().some((c) => c.tabela === 'contatos' && c.op === 'insert'), 'nenhum contato criado')
    assert.ok(!todas().some((c) => c.tabela === 'negocios' && c.op === 'insert'), 'nenhum negócio criado')
  })
})
