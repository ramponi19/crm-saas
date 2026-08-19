import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ranking gamificado (Sprint 3.1) — métricas por vendedor no período + score.
 * Generaliza o ranking que existia só no relatório imob (5.2.b) para todos os
 * segmentos. Score = captações×1 + visitas×2 + propostas×3 + vendas×5.
 */
type Db = SupabaseClient

export interface LinhaRanking {
  usuario_id: string
  nome: string
  vendas: number
  faturamento: number
  captacoes: number
  /**
   * Imóveis que a pessoa captou no período.
   *
   * Métrica SEPARADA de `captacoes` de propósito. Captar lead é atender quem
   * chegou; captar imóvel é trazer o produto para a loja vender — na imobiliária é
   * metade do trabalho, e era o número que o CRM dela mostrava e o nosso não.
   * Somar os dois no mesmo campo estragaria `conversao`, que é venda por lead.
   * Zero em quem não capta ativo.
   */
  imoveisCaptados: number
  visitas: number
  propostas: number
  conversao: number
  score: number
  /** Vendas que ainda não contam: aparelho aceito em troca não chegou na loja. */
  vendasRetidas: number
  faturamentoRetido: number
}

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

/**
 * Janela [início, fim) de um mês "AAAA-MM", em horário local.
 *
 * Use SEMPRE esta função. O cálculo ingênuo — `new Date(\`${mes}-01\`)` e depois
 * `getMonth() + 1` — está errado: a string só com data é lida como meia-noite
 * UTC, mas `getMonth()` responde em hora local. A oeste de Greenwich isso cai no
 * mês ANTERIOR, e o "fim" acaba poucas horas depois do início em vez de um mês.
 * Medido em America/Sao_Paulo: janela de 3 horas.
 */
export function janelaDoPeriodo(periodo: string): { ini: string; fim: string } {
  const [ano, mes] = periodo.split('-').map(Number)
  return { ini: new Date(ano, mes - 1, 1).toISOString(), fim: new Date(ano, mes, 1).toISOString() }
}

export async function calcularRanking(
  db: Db,
  empresaId: number,
  periodo: string,
  /**
   * Captação de ativo INJETADA por quem conhece a vertical.
   *
   * Este módulo é núcleo e não consulta `imoveis`: quem sabe onde mora o ativo do
   * segmento é a camada dele (`lib/captacao-imob.ts`). Sem a injeção, a coluna sai
   * zerada — não erra, só não mostra.
   */
  opts: { imoveisCaptados?: Map<string, number> } = {},
): Promise<LinhaRanking[]> {
  const { ini, fim } = janelaDoPeriodo(periodo)

  const [{ data: membrosRaw }, { data: vendas }, { data: visitas }, { data: leads }, { data: propostas }, { data: trocasPendentes }] = await Promise.all([
    db.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    db.from('vendas').select('vendedor_id, valor_venda, data_venda, status, grupo_pdv').eq('empresa_id', empresaId).gte('data_venda', ini).lt('data_venda', fim),
    db.from('visitas').select('corretor_id, status, data_hora').eq('empresa_id', empresaId).eq('status', 'realizada').gte('data_hora', ini).lt('data_hora', fim),
    db.from('leads').select('responsavel_id, created_at').eq('empresa_id', empresaId).gte('created_at', ini).lt('created_at', fim),
    db.from('propostas').select('lead_id, created_at').eq('empresa_id', empresaId).gte('created_at', ini).lt('created_at', fim),
    // Aparelho aceito em troca que ainda não chegou. Aparelho é dinheiro: se não
    // entrou, a venda não subiu ninguém no ranking nem na meta. Quem cobra o
    // cliente é o vendedor — sem isso o prejuízo da troca que não veio fica todo
    // com o dono e o placar segue premiando a venda.
    //
    // `ativo` no filtro é a saída: excluir a unidade no estoque encerra a
    // pendência (o caso do cliente que nunca vai trazer).
    db.from('inventario_unidades').select('grupo_pdv')
      .eq('empresa_id', empresaId).eq('status', 'pendente').eq('ativo', true).not('grupo_pdv', 'is', null),
  ])

  const gruposRetidos = new Set(
    ((trocasPendentes ?? []) as { grupo_pdv: string | null }[])
      .map((u) => u.grupo_pdv).filter((g): g is string => !!g),
  )

  // Propostas → responsável (via lead), inclusive de leads criados antes do período.
  const propLeadIds = [...new Set(((propostas ?? []) as { lead_id: number | null }[]).map((p) => p.lead_id).filter((x): x is number => x != null))]
  const respByLead = new Map<number, string | null>()
  if (propLeadIds.length) {
    const { data: propLeads } = await db.from('leads').select('id, responsavel_id').in('id', propLeadIds)
    for (const l of (propLeads ?? []) as { id: number; responsavel_id: string | null }[]) respByLead.set(l.id, l.responsavel_id)
  }

  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const linhas = new Map<string, LinhaRanking>()
  for (const m of (membrosRaw ?? []) as unknown as MembroRow[]) {
    linhas.set(m.usuario_id, { usuario_id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—', vendas: 0, faturamento: 0, captacoes: 0, imoveisCaptados: 0, visitas: 0, propostas: 0, conversao: 0, score: 0, vendasRetidas: 0, faturamentoRetido: 0 })
  }
  const get = (id: string | null) => (id ? linhas.get(id) : undefined)

  for (const v of (vendas ?? []) as { vendedor_id: string | null; valor_venda: number; status: string | null; grupo_pdv: string | null }[]) {
    if (v.status !== 'concluida') continue
    const l = get(v.vendedor_id); if (!l) continue
    // Retida vai para o lado de fora do score e do faturamento — não some, mas
    // também não pontua até o aparelho estar na loja.
    if (v.grupo_pdv && gruposRetidos.has(v.grupo_pdv)) {
      l.vendasRetidas += 1; l.faturamentoRetido += Number(v.valor_venda) || 0
      continue
    }
    l.vendas += 1; l.faturamento += Number(v.valor_venda) || 0
  }
  for (const v of (visitas ?? []) as { corretor_id: string | null }[]) {
    const l = get(v.corretor_id); if (l) l.visitas += 1
  }
  for (const ld of (leads ?? []) as { responsavel_id: string | null }[]) {
    const l = get(ld.responsavel_id); if (l) l.captacoes += 1
  }
  for (const p of (propostas ?? []) as { lead_id: number | null }[]) {
    const l = get(p.lead_id != null ? respByLead.get(p.lead_id) ?? null : null); if (l) l.propostas += 1
  }

  for (const [id, qtd] of opts.imoveisCaptados ?? []) {
    const l = linhas.get(id); if (l) l.imoveisCaptados = qtd
  }

  for (const l of linhas.values()) {
    l.conversao = l.captacoes > 0 ? Math.round((l.vendas / l.captacoes) * 100) : 0
    // Captar imóvel pontua igual a captar lead: é trabalho que traz produto.
    l.score = l.captacoes * 1 + l.imoveisCaptados * 1 + l.visitas * 2 + l.propostas * 3 + l.vendas * 5
  }

  return [...linhas.values()].sort((a, b) => b.score - a.score || b.faturamento - a.faturamento)
}

/** Valor realizado de uma métrica para uma linha (usado no progresso das metas). */
export function valorMetrica(linha: LinhaRanking | undefined, tipo: string): number {
  if (!linha) return 0
  switch (tipo) {
    case 'faturamento': return linha.faturamento
    case 'visitas': return linha.visitas
    case 'propostas': return linha.propostas
    case 'captacoes': return linha.captacoes
    case 'imoveis_captados': return linha.imoveisCaptados
    case 'vendas': case 'fechamentos': default: return linha.vendas
  }
}
