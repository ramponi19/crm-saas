/**
 * OS NÚMEROS DO PAINEL ANTES E DEPOIS DE `lib/painel/metricas.ts` (item 2.1).
 *
 *   TESTE_URL=http://localhost:54323 TESTE_ANON=<anon> TESTE_EMPRESA=1 \
 *   TESTE_JWTS="dono=<jwt>,vendedor=<jwt>" npx tsx scripts/comparar-painel.mts
 *
 * Contra a cópia. ANTES é a conta que a página e /api/dashboard faziam até a
 * etapa 0, copiada aqui sobre as views (`vendas`, `leads`, `clientes`…). DEPOIS é
 * a lib, sobre o core. Cada pessoa entra com o próprio JWT: o escopo do vendedor
 * e a RLS contam.
 *
 * Diferenças esperadas, e só estas:
 *   - lucro e margem: antes somavam a venda sem custo como lucro inteiro;
 *   - funil: antes contava no servidor uma lista que o PostgREST corta em 1.000.
 */
import { createClient } from '@supabase/supabase-js'
import { escopoDoUsuario, aplicarEscopo } from '../lib/escopo'
import {
  vendasDesde, vendasRecentes, contagensDoPainel, resultadoDasVendas, concluidas, inicioDosPeriodos,
} from '../lib/painel/metricas'

const url = process.env.TESTE_URL ?? ''
const anon = process.env.TESTE_ANON ?? ''
const empresaId = Number(process.env.TESTE_EMPRESA ?? 1)
const jwts = (process.env.TESTE_JWTS ?? '').split(',').filter(Boolean).map((p) => p.split('=') as [string, string])
if (!url || !anon || !jwts.length) {
  console.error('uso: TESTE_URL=... TESTE_ANON=... TESTE_JWTS="nome=jwt,..." npx tsx scripts/comparar-painel.mts')
  process.exit(1)
}

function cliente(jwt: string) {
  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // Sem sessão gravada, getUser() não acha o token; o app real tem o cookie.
  const getUser = db.auth.getUser.bind(db.auth)
  ;(db.auth as unknown as { getUser: () => ReturnType<typeof getUser> }).getUser = () => getUser(jwt)
  return db
}

type Db = ReturnType<typeof cliente>

/** A conta de antes, sobre as views. */
async function antes(db: Db) {
  const escopo = await escopoDoUsuario(db, empresaId)
  const starts = inicioDosPeriodos()
  const inicio12m = new Date(); inicio12m.setMonth(inicio12m.getMonth() - 12); inicio12m.setDate(1); inicio12m.setHours(0, 0, 0, 0)
  const head = { count: 'exact' as const, head: true }
  // Sem esquema tipado: a cópia antiga lê as views, que o tipo do app já não descreve como antes.
  const solto = db as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const qVendas = solto.from('vendas')
    .select('id, valor_venda, lucro, data_venda, canal_venda, status, vendedor_id, produtos!produto_id(nome)')
    .eq('empresa_id', empresaId).not('status', 'in', '("encomenda","pendente_entrega")').gte('data_venda', inicio12m.toISOString())
  const [vendasR, clientes, ativos, novos, estoque, assist, funilR] = await Promise.all([
    aplicarEscopo(qVendas, escopo, 'vendedor_id'),
    solto.from('clientes').select('*', head).eq('empresa_id', empresaId).eq('ativo', true),
    aplicarEscopo(solto.from('leads').select('*', head).eq('empresa_id', empresaId).eq('ativo', true), escopo, 'responsavel_id'),
    aplicarEscopo(solto.from('leads').select('*', head).eq('empresa_id', empresaId).eq('ativo', true).eq('kanban_status', 'novo'), escopo, 'responsavel_id'),
    solto.from('inventario_unidades').select('*', head).eq('empresa_id', empresaId).eq('status', 'disponivel').eq('ativo', true),
    solto.from('garantias_assistencias').select('*', head).eq('empresa_id', empresaId).not('status', 'in', '(concluido,entregue,cancelada,recusado,reprovado)'),
    aplicarEscopo(solto.from('leads').select('kanban_status').eq('empresa_id', empresaId).eq('ativo', true), escopo, 'responsavel_id'),
  ])
  type V = { id: number; valor_venda: number; lucro: number | null; data_venda: string | null; canal_venda: string | null; status: string | null; produtos: { nome: string | null } | null }
  const vendas = (vendasR.data ?? []) as unknown as V[]
  const conc = vendas.filter((v) => v.status === 'concluida')
  const periodos: Record<string, unknown> = {}
  for (const [k, ini] of Object.entries(starts)) {
    const f = conc.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= ini.getTime())
    const receita = f.reduce((s, v) => s + Number(v.valor_venda), 0)
    const lucro = f.reduce((s, v) => s + (Number(v.lucro) || 0), 0)
    periodos[k] = { receita, qtd: f.length, ticket: f.length ? receita / f.length : 0, lucro, margem: receita > 0 ? Math.round((lucro / receita) * 100) : 0 }
  }
  const funil: Record<string, number> = {}
  for (const l of (funilR.data ?? []) as Array<{ kanban_status: string | null }>) { const s = l.kanban_status ?? 'novo'; funil[s] = (funil[s] ?? 0) + 1 }
  const recentes = [...vendas].sort((a, b) => new Date(b.data_venda ?? 0).getTime() - new Date(a.data_venda ?? 0).getTime()).slice(0, 6).map((v) => v.id)
  const mes = conc.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= starts.mes.getTime())
  const porCanal: Record<string, number> = {}
  for (const v of conc) { const c = v.canal_venda ?? 'loja_fisica'; porCanal[c] = (porCanal[c] ?? 0) + 1 }
  const top: Record<string, number> = {}
  for (const v of mes) if (v.produtos?.nome) top[v.produtos.nome] = (top[v.produtos.nome] ?? 0) + 1
  return {
    escopo: escopo.soMeu ? 'só o meu' : 'empresa',
    periodos,
    contagens: { clientes: clientes.count, leadsAtivos: ativos.count, leadsNovos: novos.count, estoque: estoque.count, assistencias: assist.count },
    funil: { novo: funil.novo ?? 0, em_contato: funil.em_contato ?? 0, negociando: funil.negociando ?? 0, convertido: funil.convertido ?? 0, perdido: funil.perdido ?? 0 },
    recentes, porCanal, topProdutos: top,
  }
}

/** A conta de agora, pela lib. */
async function depois(db: Db) {
  const escopo = await escopoDoUsuario(db, empresaId)
  const starts = inicioDosPeriodos()
  const inicio12m = new Date(); inicio12m.setMonth(inicio12m.getMonth() - 12); inicio12m.setDate(1); inicio12m.setHours(0, 0, 0, 0)
  // As funções da lib são tipadas para o cliente do servidor; aqui é o mesmo cliente do supabase-js.
  const d = db as never
  const [vendas, recentes, c] = await Promise.all([
    vendasDesde(d, empresaId, escopo, inicio12m),
    vendasRecentes(d, empresaId, escopo, 6),
    contagensDoPainel(d, empresaId, escopo),
  ])
  const conc = concluidas(vendas)
  const periodos: Record<string, unknown> = {}
  for (const [k, ini] of Object.entries(starts)) {
    const r = resultadoDasVendas(conc.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= ini.getTime()))
    periodos[k] = { receita: r.receita, qtd: r.qtdVendas, ticket: r.ticketMedio, lucro: r.lucro, margem: r.margem, semCusto: r.semCusto }
  }
  const mes = conc.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= starts.mes.getTime())
  const porCanal: Record<string, number> = {}
  for (const v of conc) { const k = v.canal_venda ?? 'loja_fisica'; porCanal[k] = (porCanal[k] ?? 0) + 1 }
  const top: Record<string, number> = {}
  for (const v of mes) if (v.produto_nome) top[v.produto_nome] = (top[v.produto_nome] ?? 0) + 1
  return {
    escopo: escopo.soMeu ? 'só o meu' : 'empresa',
    periodos,
    contagens: { clientes: c.totalClientes, leadsAtivos: c.leadsAtivos, leadsNovos: c.leadsNovos, estoque: c.estoqueDisponivel, assistencias: c.assistenciasAbertas },
    funil: c.funil,
    recentes: recentes.map((v) => v.id), porCanal, topProdutos: top,
  }
}

function diferencas(a: unknown, b: unknown, caminho = ''): string[] {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const chaves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    return chaves.flatMap((k) => diferencas((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], caminho ? `${caminho}.${k}` : k))
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${caminho}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`]
}

let total = 0
for (const [quem, jwt] of jwts) {
  const db = cliente(jwt)
  const [a, b] = await Promise.all([antes(db), depois(db)])
  const dif = diferencas(a, b)
  total += dif.length
  console.log(`\n== ${quem} (${b.escopo}) — ${dif.length ? `${dif.length} diferença(s)` : 'idêntico'}`)
  for (const linha of dif) console.log('  ' + linha)
}
console.log(`\n${total} diferença(s) no total`)
