import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { aplicarEscopo, type Escopo } from '@/lib/escopo'
import { SEM_NOME } from '@/lib/sem-nome'

/**
 * TODO NÚMERO DO PAINEL SAI DAQUI (etapa 0, 21/10/2026).
 *
 * Antes, a página (`app/(dashboard)/dashboard/page.tsx`) e a rota que a
 * sobrescreve no navegador (`/api/dashboard`) montavam cada uma as próprias
 * consultas, sobre as views de compatibilidade (`vendas`, `leads`, `clientes`,
 * `inventario_unidades`, `garantias_assistencias`). Duas cópias da mesma conta
 * já deram vazamento antes (o escopo do vendedor, ver `lib/escopo.ts`).
 * Desde 21/10/2026 a rota não existe mais: a página chama `painelCompleto`, no fim
 * deste arquivo, uma vez só (era a mesma conta feita duas vezes por abertura).
 *
 * Agora cada número tem UMA consulta, escrita aqui, contra as tabelas do core:
 *
 *   número                    tabela                  regra
 *   ───────────────────────── ─────────────────────── ─────────────────────────────────────
 *   vendas, ticket, lucro     vendas_vendas           fora encomenda e pendente_entrega;
 *                                                     KPI só conta `concluida`
 *   lucro bruto e margem      vendas_vendas           SÓ sobre vendas com valor_custo > 0
 *   leads ativos              negocios                dados._lead.ativo ausente ou ≠ false
 *   leads novos / funil       negocios + funil_etapas slug da etapa (novo, em_contato…)
 *   clientes                  contatos                tem `_cliente` em dados e ativo
 *   estoque disponível        estoque_unidades        status disponivel e ativo
 *   assistências abertas      assistencia_garantias   status fora dos encerrados
 *   ranking e metas           empresa_usuarios,       metas do mês corrente
 *                             metas_comissoes
 *   meus follow-ups           tarefas + negocios      abertas do usuário, nome pelo contato
 *   primeiros passos          estoque_produtos,       só contagens (o card some quando
 *                             canais, negocios,       tudo está feito)
 *                             vendas_vendas
 *
 * ESCOPO: venda e lead respeitam `escopoDoUsuario` (o vendedor sem permissão
 * vê só o dele). Estoque, assistência e cliente são da loja — operação
 * compartilhada, não resultado individual.
 */

/** Serve ao cliente do servidor e ao do navegador (os cards do painel que carregam sozinhos). */
type Db = SupabaseClient<Database>

// ── Lucro honesto ─────────────────────────────────────────────────────────

export interface ResultadoVendas {
  receita: number
  qtdVendas: number
  ticketMedio: number
  /**
   * `null` quando NENHUMA venda do período tem custo lançado. A coluna
   * `lucro` de vendas_vendas é `valor_venda - valor_custo` com custo 0 por
   * padrão: somá-la anunciava "margem de 100%" — em 20/10, 63 das 66 vendas
   * do ano da JM estavam sem custo.
   */
  lucro: number | null
  /** Margem sobre o faturamento das vendas COM custo; `null` junto com o lucro. */
  margem: number | null
  /** Quantas vendas do período ficaram fora do lucro por não ter custo. */
  semCusto: number
}

export function temCusto(v: { valor_custo: number | null }): boolean {
  return Number(v.valor_custo ?? 0) > 0
}

export function resultadoDasVendas(vendas: Array<{ valor_venda: number | null; valor_custo: number | null }>): ResultadoVendas {
  const receita = vendas.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
  const qtdVendas = vendas.length
  const comCusto = vendas.filter(temCusto)
  const receitaComCusto = comCusto.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
  const lucro = comCusto.length
    ? comCusto.reduce((s, v) => s + (Number(v.valor_venda) || 0) - Number(v.valor_custo), 0)
    : null
  return {
    receita,
    qtdVendas,
    ticketMedio: qtdVendas > 0 ? receita / qtdVendas : 0,
    lucro,
    margem: lucro !== null && receitaComCusto > 0 ? Math.round((lucro / receitaComCusto) * 100) : null,
    semCusto: qtdVendas - comCusto.length,
  }
}

// ── Períodos ──────────────────────────────────────────────────────────────

export function inicioDosPeriodos(): Record<string, Date> {
  const now = new Date()
  const hoje = new Date(now); hoje.setHours(0, 0, 0, 0)
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7); d7.setHours(0, 0, 0, 0)
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30); d30.setHours(0, 0, 0, 0)
  const mes = new Date(now.getFullYear(), now.getMonth(), 1)
  const ano = new Date(now.getFullYear(), 0, 1)
  return { hoje, '7d': d7, '30d': d30, mes, ano }
}

// ── Vendas ────────────────────────────────────────────────────────────────

export interface VendaDoPainel {
  id: number
  valor_venda: number
  valor_custo: number | null
  data_venda: string | null
  canal_venda: string | null
  forma_pagamento: string | null
  status: string | null
  vendedor_id: string | null
  produto_nome: string | null
  cliente_nome: string | null
}

/** Encomenda e pendente de entrega ainda não são venda feita. */
const FORA_DO_PAINEL = '("encomenda","pendente_entrega")'

const COLUNAS_VENDA =
  'id, valor_venda, valor_custo, data_venda, canal_venda, forma_pagamento, status, vendedor_id, ' +
  'produto:estoque_produtos!produto_id(nome), cliente:contatos!cliente_id(nome)'

type LinhaVenda = Omit<VendaDoPainel, 'produto_nome' | 'cliente_nome'> & {
  produto: { nome: string | null } | null
  cliente: { nome: string | null } | null
}

function normalizarVenda(v: LinhaVenda): VendaDoPainel {
  const { produto, cliente, ...resto } = v
  return {
    ...resto,
    valor_venda: Number(v.valor_venda) || 0,
    produto_nome: produto?.nome ?? null,
    cliente_nome: cliente ? (cliente.nome ?? SEM_NOME) : null,
  }
}

/** Vendas desde `desde` (inclusive), no escopo do usuário. */
export async function vendasDesde(db: Db, empresaId: number, escopo: Escopo, desde: Date): Promise<VendaDoPainel[]> {
  const { data } = await aplicarEscopo(
    db.from('vendas_vendas').select(COLUNAS_VENDA)
      .eq('empresa_id', empresaId)
      .not('status', 'in', FORA_DO_PAINEL)
      .gte('data_venda', desde.toISOString()),
    escopo, 'vendedor_id',
  )
  return ((data ?? []) as unknown as LinhaVenda[]).map(normalizarVenda)
}

export type VendaRecente = Omit<VendaDoPainel, 'valor_custo' | 'vendedor_id'>

/** As últimas `n` vendas por data da venda, de qualquer período. O custo não sai daqui: a lista vai para o navegador. */
export async function vendasRecentes(db: Db, empresaId: number, escopo: Escopo, n: number): Promise<VendaRecente[]> {
  const { data } = await aplicarEscopo(
    db.from('vendas_vendas').select(COLUNAS_VENDA)
      .eq('empresa_id', empresaId)
      .not('status', 'in', FORA_DO_PAINEL)
      .order('data_venda', { ascending: false, nullsFirst: false })
      .limit(n),
    escopo, 'vendedor_id',
  )
  return ((data ?? []) as unknown as LinhaVenda[]).map((v) => {
    const { valor_custo: _custo, vendedor_id: _vendedor, ...venda } = normalizarVenda(v)
    return venda
  })
}

export const concluidas = (vendas: VendaDoPainel[]) => vendas.filter((v) => v.status === 'concluida')

// ── Contagens ─────────────────────────────────────────────────────────────

export interface FunilDoPainel { novo: number; em_contato: number; negociando: number; convertido: number; perdido: number }

export interface ContagensDoPainel {
  totalClientes: number
  leadsAtivos: number
  leadsNovos: number
  estoqueDisponivel: number
  assistenciasAbertas: number
  funil: FunilDoPainel
}

/** Status em que a assistência já saiu da bancada. */
const ASSISTENCIA_ENCERRADA = '(concluido,entregue,cancelada,recusado,reprovado)'

/**
 * Negócio ativo: `dados._lead.ativo` ausente ou diferente de false — a mesma
 * regra da view `leads` (`coalesce(...::boolean, true)`).
 */
const NEGOCIO_ATIVO = 'dados->_lead->>ativo.is.null,dados->_lead->>ativo.neq.false'

const ETAPAS_DO_FUNIL = ['novo', 'em_contato', 'negociando', 'convertido', 'perdido'] as const

export async function contagensDoPainel(db: Db, empresaId: number, escopo: Escopo): Promise<ContagensDoPainel> {
  const head = { count: 'exact' as const, head: true }
  const negociosAtivos = () => db.from('negocios').select('id', head).eq('empresa_id', empresaId).or(NEGOCIO_ATIVO)
  /**
   * Leads por etapa: a contagem vem do banco, não de uma lista. A versão
   * anterior baixava `kanban_status` de todos os leads ativos e contava no
   * servidor — e o PostgREST do Supabase devolve no máximo 1.000 linhas. Na
   * cópia, com esse limite: 1.732 leads ativos visíveis ao dono da JM, e o funil
   * mostrava 144 novos onde havia 441 (o alerta, que já contava no banco,
   * dizia 441 na mesma tela).
   */
  const naEtapa = (slug: string) => aplicarEscopo(
    db.from('negocios').select('id, funil_etapas!inner(slug)', head)
      .eq('empresa_id', empresaId).or(NEGOCIO_ATIVO).eq('funil_etapas.slug', slug),
    escopo, 'responsavel_id',
  )

  const [clientes, ativos, estoque, assistencias, ...porEtapa] = await Promise.all([
    db.from('contatos').select('id', head).eq('empresa_id', empresaId).eq('ativo', true).not('dados->_cliente', 'is', null),
    aplicarEscopo(negociosAtivos(), escopo, 'responsavel_id'),
    db.from('estoque_unidades').select('id', head).eq('empresa_id', empresaId).eq('status', 'disponivel').eq('ativo', true),
    db.from('assistencia_garantias').select('id', head).eq('empresa_id', empresaId).not('status', 'in', ASSISTENCIA_ENCERRADA),
    ...ETAPAS_DO_FUNIL.map(naEtapa),
  ])

  const funil = Object.fromEntries(ETAPAS_DO_FUNIL.map((slug, i) => [slug, porEtapa[i].count ?? 0])) as unknown as FunilDoPainel
  return {
    totalClientes: clientes.count ?? 0,
    leadsAtivos: ativos.count ?? 0,
    leadsNovos: funil.novo,
    estoqueDisponivel: estoque.count ?? 0,
    assistenciasAbertas: assistencias.count ?? 0,
    funil,
  }
}

// ── Equipe e metas ────────────────────────────────────────────────────────

export async function equipeEMetas(db: Db, empresaId: number, mesAno: string) {
  const [{ data: equipe }, { data: metas }] = await Promise.all([
    db.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(id, nome)').eq('empresa_id', empresaId).eq('ativo', true),
    db.from('metas_comissoes').select('usuario_id, meta_vendas_valor').eq('empresa_id', empresaId).eq('mes_ano', mesAno),
  ])
  type Vinculo = { usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null }
  const vendedores = ((equipe ?? []) as unknown as Vinculo[])
    .map((eu) => (Array.isArray(eu.usuarios) ? eu.usuarios[0] : eu.usuarios))
    .filter((u): u is { id: string; nome: string } => Boolean(u?.id))
  const metaPorUsuario = Object.fromEntries((metas ?? []).map((m) => [m.usuario_id, m.meta_vendas_valor])) as Record<string, number | null>
  return { vendedores, metaPorUsuario }
}

// ── Cards que carregam no navegador ───────────────────────────────────────

export interface FollowUp { id: number; titulo: string; vencimento: string | null; lead_nome: string | null }

/** As próximas tarefas abertas do usuário, com o nome do contato do negócio. */
export async function meusFollowUps(db: Db, userId: string, n: number): Promise<FollowUp[]> {
  const { data } = await db
    .from('tarefas').select('id, titulo, vencimento, negocio:negocios!lead_id(contato:contatos(nome))')
    .eq('concluida', false).eq('responsavel_id', userId)
    .order('vencimento', { nullsFirst: false }).limit(n)
  type Linha = { id: number; titulo: string; vencimento: string | null; negocio: { contato: { nome: string | null } | null } | null }
  return ((data ?? []) as unknown as Linha[]).map((t) => ({
    id: t.id, titulo: t.titulo, vencimento: t.vencimento, lead_nome: t.negocio?.contato?.nome ?? null,
  }))
}

/** Contagens do checklist de primeiros passos. A RLS recorta a empresa. */
export async function primeirosPassos(db: Db) {
  const head = { count: 'exact' as const, head: true }
  const [produtos, whatsapp, leads, vendas] = await Promise.all([
    db.from('estoque_produtos').select('id', head).eq('ativo', true),
    db.from('canais').select('id', head).eq('tipo', 'whatsapp').eq('status', 'ativo'),
    db.from('negocios').select('id', head).or(NEGOCIO_ATIVO),
    db.from('vendas_vendas').select('id', head),
  ])
  return { produtos: produtos.count ?? 0, whatsapp: whatsapp.count ?? 0, leads: leads.count ?? 0, vendas: vendas.count ?? 0 }
}

// ── O painel inteiro, numa ida só ─────────────────────────────────────────

export interface VendedorDoPainel { id: string; nome: string; total: number; qtd: number; meta: number | null }

export interface DadosPainel {
  /** Resultado por período (hoje, 7d, 30d, mês, ano) — só vendas concluídas. */
  periods: Record<string, ResultadoVendas>
  faturamentoMensal: Array<{ mes: string; total: number }>
  /** Donut: vendas concluídas DO MÊS por canal. */
  porCanal: Record<string, number>
  topProdutos: Array<{ nome: string; qtd: number }>
  topVendedores: VendedorDoPainel[]
  vendasRecentes: VendaRecente[]
  contagens: ContagensDoPainel
}

/**
 * TUDO o que o painel mostra, calculado UMA vez, no servidor (21/10/2026).
 *
 * Antes eram duas execuções por abertura: a página montava os números do mês e,
 * já no navegador, o painel chamava /api/dashboard, que refazia tudo lendo 12 meses
 * de vendas — CPU ativa da Vercel em dobro, no plano com teto de 4 h/mês. A rota
 * saiu; a página chama esta função e entrega pronto, inclusive os outros períodos
 * (a troca Hoje/7 dias/Mês/Ano é só escolher qual mostrar).
 */
export async function painelCompleto(db: Db, empresaId: number, escopo: Escopo): Promise<DadosPainel> {
  const starts = inicioDosPeriodos()
  const inicio12m = new Date()
  inicio12m.setMonth(inicio12m.getMonth() - 12)
  inicio12m.setDate(1); inicio12m.setHours(0, 0, 0, 0)
  const mesAtual = new Date().toISOString().slice(0, 7) // YYYY-MM

  const [vendas, recentes, contagens, { vendedores, metaPorUsuario }] = await Promise.all([
    vendasDesde(db, empresaId, escopo, inicio12m),
    vendasRecentes(db, empresaId, escopo, 6),
    contagensDoPainel(db, empresaId, escopo),
    equipeEMetas(db, empresaId, mesAtual),
  ])

  // KPIs por período (só concluídas). Lucro e margem só onde há custo lançado.
  const fechadas = concluidas(vendas)
  const periods: Record<string, ResultadoVendas> = {}
  for (const [key, start] of Object.entries(starts)) {
    const startMs = start.getTime()
    periods[key] = resultadoDasVendas(fechadas.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= startMs))
  }

  // Faturamento mensal, 12 meses.
  const porMes: Record<string, number> = {}
  for (const v of fechadas) {
    if (!v.data_venda) continue
    const d = new Date(v.data_venda)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    porMes[k] = (porMes[k] ?? 0) + v.valor_venda
  }
  const faturamentoMensal = Object.entries(porMes).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))

  // O mês: produtos, canais e ranking.
  const inicioMes = starts.mes.getTime()
  const vendasMes = fechadas.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= inicioMes)

  const produtoCount: Record<string, number> = {}
  for (const v of vendasMes) if (v.produto_nome) produtoCount[v.produto_nome] = (produtoCount[v.produto_nome] ?? 0) + 1
  const topProdutos = Object.entries(produtoCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nome, qtd]) => ({ nome, qtd }))

  const porCanal: Record<string, number> = {}
  for (const v of vendasMes) { const c = v.canal_venda ?? 'loja_fisica'; porCanal[c] = (porCanal[c] ?? 0) + 1 }

  /**
   * Quem não pode ver resultado de outros aparece SOZINHO no ranking.
   *
   * Filtrar só as vendas não bastaria: a lista era montada a partir de todos os
   * usuários da empresa, então o vendedor continuaria vendo o nome e a meta dos
   * colegas (com total zerado, o que é pior — parece que ninguém vendeu).
   */
  const vendedorMap = Object.fromEntries(vendedores.map((u) => [u.id, u.nome]))
  const stats: Record<string, Omit<VendedorDoPainel, 'id'>> = {}
  const paraRanking = escopo.soMeu && escopo.userId ? vendedores.filter((u) => u.id === escopo.userId) : vendedores
  for (const u of paraRanking) stats[u.id] = { nome: u.nome, total: 0, qtd: 0, meta: metaPorUsuario[u.id] ?? null }
  for (const v of vendasMes) {
    if (!v.vendedor_id) continue
    if (!stats[v.vendedor_id]) stats[v.vendedor_id] = { nome: vendedorMap[v.vendedor_id] ?? 'Vendedor', total: 0, qtd: 0, meta: null }
    stats[v.vendedor_id].total += v.valor_venda
    stats[v.vendedor_id].qtd += 1
  }
  const topVendedores = Object.entries(stats)
    .map(([id, s]) => ({ id, ...s }))
    .filter((v) => v.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  return { periods, faturamentoMensal, porCanal, topProdutos, topVendedores, vendasRecentes: recentes, contagens }
}
