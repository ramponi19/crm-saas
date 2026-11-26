import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { aplicarEscopo, type Escopo } from '@/lib/escopo'
import { SEM_NOME } from '@/lib/sem-nome'
import { lerFechamentos } from '@/lib/fechamentos'
import { dataDaConclusao, filtroConcluidaDesde, resumoEmAberto, STATUS_EM_ABERTO, type ResumoEmAberto } from '@/lib/vendas-mes'
import { FUSO_PADRAO, agora, inicioDoAno, inicioDoDia, inicioDoDiaHaDias, inicioDoMes, mesNoFuso, paraData } from '@/lib/datas'
import { JUNCAO_CUSTO_VENDA, custoDaVenda } from '@/lib/custo'

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
 *   lucro bruto e margem      vendas_vendas_custos    SÓ sobre vendas com custo > 0, e só com
 *                             (satélite, etapa 1.1e)  estoque.ver_custo (sem ela a junção nem é pedida)
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
   * `null` quando NENHUMA venda do período tem custo lançado. Antes da 1.1e a
   * coluna `lucro` de vendas_vendas era `valor_venda - valor_custo` com custo 0
   * por padrão: somá-la anunciava "margem de 100%" — em 20/10, 63 das 66 vendas
   * do ano da JM estavam sem custo. Desde a 1.1e o custo vem do satélite e o
   * pendente é nulo; o 0 das vendas antigas continua contando como "sem custo".
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

/**
 * Início de cada período do painel, à MEIA-NOITE DA LOJA (fuso da empresa).
 *
 * Até 10/11/2026 era `setHours(0,0,0,0)` e `new Date(ano, mes, 1)` no servidor, que
 * roda em UTC: o "Hoje" começava às 21h de ontem (passava o dia somando as vendas de
 * ontem das 21h às 24h e zerava às 21h), e "Mês"/"Ano" começavam às 21h do último
 * dia do período anterior. Os períodos mantêm o mesmo sentido (7d = desde 00h de 7
 * dias atrás); muda só onde o dia começa.
 */
export function inicioDosPeriodos(agoraRef: Date = agora(), fuso: string = FUSO_PADRAO): Record<string, Date> {
  return {
    hoje: inicioDoDia(agoraRef, fuso),
    '7d': inicioDoDiaHaDias(7, agoraRef, fuso),
    '30d': inicioDoDiaHaDias(30, agoraRef, fuso),
    mes: inicioDoMes(agoraRef, fuso),
    ano: inicioDoAno(agoraRef, fuso),
  }
}

// ── Vendas ────────────────────────────────────────────────────────────────

export interface VendaDoPainel {
  id: number
  valor_venda: number
  /**
   * Custo da venda, do satélite vendas_vendas_custos (etapa 1.1e) — NÃO a coluna antiga de vendas_vendas. Nulo
   * sem estoque.ver_custo (a junção nem é pedida) ou com custo pendente. Fica no servidor: não sai em VendaRecente.
   */
  valor_custo: number | null
  data_venda: string | null
  /** Quando foi concluída (hotfix H1). O mês do faturamento é `concluida_em ?? data_venda` (lib/vendas-mes). */
  concluida_em: string | null
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
  'id, valor_venda, data_venda, concluida_em, canal_venda, forma_pagamento, status, vendedor_id, ' +
  'produto:estoque_produtos!produto_id(nome), cliente:contatos!cliente_id(nome)'

/** As colunas da venda, com a junção do custo só para quem tem estoque.ver_custo. */
const colunasVenda = (verCusto: boolean): string => (verCusto ? `${COLUNAS_VENDA}, ${JUNCAO_CUSTO_VENDA}` : COLUNAS_VENDA)

type LinhaVenda = Omit<VendaDoPainel, 'produto_nome' | 'cliente_nome' | 'valor_custo'> & {
  produto: { nome: string | null } | null
  cliente: { nome: string | null } | null
  custo?: { valor_custo: number | null } | { valor_custo: number | null }[] | null
}

function normalizarVenda(v: LinhaVenda): VendaDoPainel {
  const { produto, cliente, custo, ...resto } = v
  return {
    ...resto,
    valor_venda: Number(v.valor_venda) || 0,
    valor_custo: custoDaVenda({ custo }),
    produto_nome: produto?.nome ?? null,
    cliente_nome: cliente ? (cliente.nome ?? SEM_NOME) : null,
  }
}

/**
 * Vendas CONCLUÍDAS (ou de balcão) desde `desde`, no escopo do usuário — pelo mês da conclusão:
 * `coalesce(concluida_em, data_venda) >= desde` (lib/vendas-mes). A encomenda lançada em outubro e
 * entregue em novembro entra em novembro.
 */
export async function vendasDesde(db: Db, empresaId: number, escopo: Escopo, desde: Date, verCusto = false): Promise<VendaDoPainel[]> {
  const { data } = await aplicarEscopo(
    db.from('vendas_vendas').select(colunasVenda(verCusto))
      .eq('empresa_id', empresaId)
      .not('status', 'in', FORA_DO_PAINEL)
      .or(filtroConcluidaDesde(desde.toISOString())),
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

/**
 * Encomendas e pendentes de entrega em aberto, no escopo do usuário — FORA do faturamento.
 * Sem filtro de data: é o estado de agora (o que está comprometido e ainda não virou venda).
 */
export async function emAbertoDoPainel(db: Db, empresaId: number, escopo: Escopo): Promise<ResumoEmAberto> {
  const { data } = await aplicarEscopo(
    db.from('vendas_vendas').select('id, valor_venda, status, grupo_pdv, pagamentos:vendas_pagamentos(valor_pago)')
      .eq('empresa_id', empresaId)
      .in('status', [...STATUS_EM_ABERTO]),
    escopo, 'vendedor_id',
  )
  return resumoEmAberto((data ?? []) as unknown as Parameters<typeof resumoEmAberto>[0])
}

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
  /**
   * Convertido e perdido somam os ciclos que o cliente REABRIU ao voltar a escrever
   * (lib/fechamentos.ts, desde 05/11/2026): a reabertura leva o negócio para a primeira
   * etapa, e só pela etapa de hoje o ganho e a perda sumiriam do painel. O mesmo cliente
   * aparece em 'novo' (o ciclo de agora) e em 'convertido' (o anterior): são dois ciclos.
   */
  const reabertos = (await lerFechamentos(db as never, empresaId, { soAtivos: true, soReabertos: true }))
    .filter((f) => f.reaberto && (!escopo.soMeu || f.responsavel_id === escopo.userId))
  funil.convertido += reabertos.filter((f) => f.status === 'ganho').length
  funil.perdido += reabertos.filter((f) => f.status === 'perdido').length
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
/**
 * PRIMEIROS PASSOS DE QUALQUER EMPRESA (17/11/2026, "pronto para vender"): loja, equipe, horário, canal de
 * atendimento e o primeiro lead — nada de ramo (antes: produtos e venda no PDV, de loja de varejo). Lê pela
 * sessão (a RLS dá a empresa); cada número é só "já fez?".
 */
export async function primeirosPassos(db: Db) {
  const head = { count: 'exact' as const, head: true }
  const [lojasCompletas, equipe, horario, canais, leads] = await Promise.all([
    db.from('filiais').select('id', head).eq('ativo', true).not('cidade', 'is', null),
    db.from('empresa_usuarios').select('id', head).eq('ativo', true),
    // 1.1h parte 2: "definiu o horário" = alguém salvou core.horario (o formato antigo `horario_comercial` só existia
    // quando a tela gravava; a semente da 1.1i grava sem pessoa e não conta).
    (db as unknown as import('@supabase/supabase-js').SupabaseClient).from('empresa_config').select('chave', head)
      .eq('modulo', 'core').eq('chave', 'horario').not('atualizado_por', 'is', null),
    db.from('canais').select('id', head).eq('status', 'ativo'),
    db.from('negocios').select('id', head).or(NEGOCIO_ATIVO),
  ])
  return {
    lojasCompletas: lojasCompletas.count ?? 0, equipe: equipe.count ?? 0, horario: horario.count ?? 0,
    canais: canais.count ?? 0, leads: leads.count ?? 0,
  }
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
  /** Encomendas e pendentes de entrega: comprometido, FORA dos números acima. */
  emAberto: ResumoEmAberto
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
export async function painelCompleto(
  db: Db, empresaId: number, escopo: Escopo, fuso: string = FUSO_PADRAO,
  /** estoque.ver_custo de quem abre o painel: sem ela o custo nem é lido (lucro e margem ficam nulos). */
  { verCusto = false, agoraRef = agora() }: { verCusto?: boolean; agoraRef?: Date } = {},
): Promise<DadosPainel> {
  const inicio12m = inicioDoMes(agoraRef, fuso, -12)
  // A meta do mês é a do mês DA LOJA: no dia 30 às 21h o UTC já está no mês seguinte.
  const mesAtual = mesNoFuso(agoraRef, fuso) // YYYY-MM

  const [vendas, recentes, contagens, { vendedores, metaPorUsuario }, emAberto] = await Promise.all([
    vendasDesde(db, empresaId, escopo, inicio12m, verCusto),
    vendasRecentes(db, empresaId, escopo, 6),
    contagensDoPainel(db, empresaId, escopo),
    equipeEMetas(db, empresaId, mesAtual),
    emAbertoDoPainel(db, empresaId, escopo),
  ])

  return {
    ...resultadosDoPainel(vendas, { vendedores, metaPorUsuario }, escopo, fuso, agoraRef),
    vendasRecentes: recentes, contagens, emAberto,
  }
}

/**
 * A conta do painel sobre as vendas já buscadas — sem banco, para o teste.
 * Cada venda cai no período e no mês pela data da CONCLUSÃO (`concluida_em ?? data_venda`).
 */
export function resultadosDoPainel(
  vendas: VendaDoPainel[],
  { vendedores, metaPorUsuario }: { vendedores: { id: string; nome: string }[]; metaPorUsuario: Record<string, number | null> },
  escopo: Escopo, fuso: string = FUSO_PADRAO, agoraRef: Date = agora(),
): Pick<DadosPainel, 'periods' | 'faturamentoMensal' | 'porCanal' | 'topProdutos' | 'topVendedores'> {
  const starts = inicioDosPeriodos(agoraRef, fuso)
  const quando = (v: VendaDoPainel) => paraData(dataDaConclusao(v))?.getTime() ?? null

  // KPIs por período (só concluídas). Lucro e margem só onde há custo lançado.
  const fechadas = concluidas(vendas)
  const periods: Record<string, ResultadoVendas> = {}
  for (const [key, start] of Object.entries(starts)) {
    const startMs = start.getTime()
    periods[key] = resultadoDasVendas(fechadas.filter((v) => (quando(v) ?? -Infinity) >= startMs))
  }

  // Faturamento mensal, 12 meses — a venda das 21h do dia 30 é do mês dela, no fuso da loja.
  const porMes: Record<string, number> = {}
  for (const v of fechadas) {
    const d = paraData(dataDaConclusao(v))
    if (!d) continue
    const k = mesNoFuso(d, fuso)
    porMes[k] = (porMes[k] ?? 0) + v.valor_venda
  }
  const faturamentoMensal = Object.entries(porMes).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))

  // O mês: produtos, canais e ranking.
  const inicioMes = starts.mes.getTime()
  const vendasMes = fechadas.filter((v) => (quando(v) ?? -Infinity) >= inicioMes)

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

  return { periods, faturamentoMensal, porCanal, topProdutos, topVendedores }
}
