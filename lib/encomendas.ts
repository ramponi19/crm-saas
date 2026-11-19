import type { SupabaseClient } from '@supabase/supabase-js'
import { agora, diaNoFuso, diasEntre, FUSO_PADRAO, paraData } from '@/lib/datas'

/**
 * A ENCOMENDA — produto que a loja vende antes de ter.
 *
 * ══ O CICLO, EM TRÊS PARADAS ═══════════════════════════════════════════════
 *
 *   1. LANÇAR   (PDV, aba Encomenda)
 *      cria o pedido de compra (`aberto`) + a venda (`encomenda`, pendente).
 *      A venda pendente NÃO entra no faturamento nem no dashboard.
 *
 *   2. CHEGOU   (POST /api/compras/receber)
 *      pedido vira `recebido` e nasce a unidade no estoque, já `reservado`
 *      para esta venda — ninguém vende no balcão o aparelho de quem encomendou.
 *
 *   3. ENTREGAR (`concluirEncomenda` aqui embaixo → RPC `concluir_encomenda`)
 *      recebe o saldo; só com o fechamento pago a venda vira `concluida`, a
 *      unidade baixa, e aí sim conta no faturamento.
 *
 * ══ POR QUE ESTE MÓDULO EXISTE ═════════════════════════════════════════════
 *
 * A etapa 3 vivia dentro de `historico-view.tsx`, em React. Quando a aba
 * Encomenda do PDV passou a precisar da mesma ação, copiar seria criar duas
 * verdades sobre "o que é entregar" — e a regra do IMEI abaixo é exatamente o
 * tipo de detalhe que sobrevive numa cópia e morre na outra.
 *
 * Sem React e sem `notify` de propósito: quem chama decide como avisar.
 */

/** Situação de uma encomenda em aberto, do ponto de vista do balcão. */
export type Situacao = 'sem_prazo' | 'no_prazo' | 'vence_hoje' | 'atrasada' | 'chegou'

export interface EncomendaAberta {
  id: number
  status: string
  previsao_entrega: string | null
  /** `recebido` = a peça chegou e está reservada para este cliente. */
  status_pedido: string | null
  unidade_id: number | null
  /** Quando alguém pediu o aparelho ao fornecedor. Nulo = ninguém pediu ainda. */
  solicitado_em?: string | null
}

/**
 * AS QUATRO PARADAS DA ENCOMENDA, na ordem em que acontecem.
 *
 * A etapa `solicitada` foi a que faltou por mais tempo: o pedido nascia e ia
 * direto para "chegou", então uma encomenda parada há 32 dias era
 * indistinguível de uma pedida ontem — e o vendedor não sabia se cobrava o dono
 * ou se só esperava.
 */
export const ETAPAS = ['lancada', 'solicitada', 'chegou', 'entregue'] as const
export type Etapa = (typeof ETAPAS)[number]

/** Em que ponto da trilha esta encomenda está. */
export function etapaAtual(e: EncomendaAberta): Etapa {
  if (e.status === 'concluida') return 'entregue'
  if (e.status_pedido === 'recebido' || e.unidade_id != null) return 'chegou'
  return e.solicitado_em ? 'solicitada' : 'lancada'
}

/** Índice da etapa — para a trilha saber o que já passou. */
export function indiceEtapa(e: EncomendaAberta): number {
  return ETAPAS.indexOf(etapaAtual(e))
}

export interface Diagnostico {
  situacao: Situacao
  /** Dias de atraso (positivo) ou que faltam (negativo). Nulo sem prazo. */
  dias: number | null
  rotulo: string
  tom: 'ok' | 'warn' | 'bad' | 'neutro' | 'acc'
}

/**
 * O que mostrar para esta encomenda, e com qual cor.
 *
 * ⚠️ A COMPARAÇÃO É DE DIA, NÃO DE INSTANTE. `new Date('2026-09-18')` é
 * meia-noite UTC, que em Brasília é dia 17 às 21h: comparado com "agora", o
 * prazo aparece vencido um dia antes da hora — e quem recebe a cobrança é o
 * vendedor. Mesma armadilha já paga em `lib/chave-imovel.ts`. Os dois dias — o
 * prometido e o de hoje — são lidos no fuso da empresa (`fuso`).
 *
 * "Chegou" vence o prazo: uma encomenda que já está na loja não é atrasada, é
 * uma entrega esperando o cliente aparecer.
 */
export function diagnosticar(e: EncomendaAberta, hoje: Date = agora(), fuso: string = FUSO_PADRAO): Diagnostico {
  if (e.status_pedido === 'recebido' || e.unidade_id != null) {
    return { situacao: 'chegou', dias: null, rotulo: 'Chegou — avisar o cliente', tom: 'ok' }
  }
  const prevista = paraData(e.previsao_entrega)
  if (!prevista) {
    return { situacao: 'sem_prazo', dias: null, rotulo: 'Sem prazo combinado', tom: 'neutro' }
  }

  const dias = diasEntre(diaNoFuso(prevista, fuso), diaNoFuso(hoje, fuso))

  if (dias > 0) return { situacao: 'atrasada', dias, rotulo: `${dias} ${dias === 1 ? 'dia' : 'dias'} de atraso`, tom: 'bad' }
  if (dias === 0) return { situacao: 'vence_hoje', dias: 0, rotulo: 'Prometida para hoje', tom: 'warn' }
  return { situacao: 'no_prazo', dias, rotulo: `Faltam ${-dias} ${dias === -1 ? 'dia' : 'dias'}`, tom: 'acc' }
}

/**
 * JUNTA OS ITENS DA MESMA ENCOMENDA.
 *
 * Cada item vira uma venda própria — é o que deixa um aparelho chegar antes do
 * outro. Mas na tela isso não pode virar três cards do mesmo cliente: quem
 * atende encomendou UMA vez, e ver o pedido rachado em linhas soltas faz
 * parecer que há três pendências onde há uma.
 *
 * Encomenda antiga (antes de 16/09/2026) não tem grupo: cada uma é o próprio
 * grupo, e o `id` da venda serve de chave.
 */
export function agruparPorEncomenda<T extends { id: number; grupo_pdv?: string | null }>(
  lista: T[],
): { chave: string; itens: T[] }[] {
  const mapa = new Map<string, T[]>()
  for (const v of lista) {
    const chave = v.grupo_pdv ?? `venda-${v.id}`
    const atual = mapa.get(chave)
    if (atual) atual.push(v)
    else mapa.set(chave, [v])
  }
  return [...mapa].map(([chave, itens]) => ({ chave, itens }))
}

/** Atrasada e sem prazo primeiro: é o que precisa de alguém. */
export function ordenarPorUrgencia<T extends EncomendaAberta>(lista: T[], hoje: Date = agora(), fuso: string = FUSO_PADRAO): T[] {
  const peso: Record<Situacao, number> = {
    atrasada: 0, vence_hoje: 1, chegou: 2, sem_prazo: 3, no_prazo: 4,
  }
  return [...lista].sort((a, b) => {
    const da = diagnosticar(a, hoje, fuso)
    const db = diagnosticar(b, hoje, fuso)
    if (peso[da.situacao] !== peso[db.situacao]) return peso[da.situacao] - peso[db.situacao]
    // Dentro do mesmo grupo: o mais vencido (ou o que vence antes) na frente.
    return (db.dias ?? -9999) - (da.dias ?? -9999)
  })
}

/** O dinheiro que o cliente paga NA ENTREGA (o saldo). Vai para `vendas_pagamentos`. */
export interface PagamentoNaEntrega {
  forma: string
  valor: number
  parcelas?: number | null
  bandeira?: string | null
  /** Com juros repassados ao cliente, quando houver (crédito/link parcelado). */
  valor_com_juros?: number | null
}

/** Acessório levado junto na entrega: vira uma venda própria no mesmo fechamento. */
export interface AcessorioNaEntrega { descricao: string; valor: number }

export interface ResultadoConcluir {
  ok: boolean
  erro?: string
  /** Todas as vendas do fechamento (itens + acessórios novos): é o que amarra o documento. */
  vendaIds: number[]
  /** Quantas peças saíram do estoque. */
  baixou: number
}

/** Total, já pago e saldo do fechamento — calculados no banco (`encomenda_saldo`). */
export interface SaldoEncomenda { total: number; pago: number; saldo: number }

/**
 * Quanto falta receber, pelo banco. A tela mostra ESTE número porque é ele que a
 * conclusão confere: somar na tela só os itens visíveis já errou (pagamento na
 * primeira linha do grupo, acessório do balcão já concluído).
 */
export async function saldoDaEncomenda(supabase: SupabaseClient, vendaId: number): Promise<SaldoEncomenda | null> {
  const { data, error } = await supabase.rpc('encomenda_saldo', { p_venda_id: vendaId } as never)
  if (error || !data) return null
  const d = data as { total?: number; pago?: number; saldo?: number }
  return { total: Number(d.total) || 0, pago: Number(d.pago) || 0, saldo: Number(d.saldo) || 0 }
}

/**
 * ENTREGAR: o ÚNICO caminho que conclui uma encomenda ou uma entrega pendente.
 *
 * Tudo acontece no banco, numa transação (`concluir_encomenda`, migração
 * 20261119000100): acessórios, o pagamento do saldo, a conferência "pagamentos do
 * fechamento = valor do fechamento", a cópia da série da unidade para a venda e a
 * baixa do estoque. Se faltar dinheiro, o banco recusa com "Saldo em aberto: R$ X"
 * e nada fica gravado.
 *
 * ⚠️ POR QUE SAIU DO NAVEGADOR (19/11/2026). Aqui morava `finalizarEncomenda`,
 * que mudava o status pelo cliente e só gravava o pagamento se alguém o passasse.
 * O "Entregar" do Histórico não passava: em 19/11 eram 52 encomendas concluídas
 * sem um centavo em `vendas_pagamentos` e 27 com o valor errado (R$ 651.827
 * vendidos x R$ 156.947 registrados). O banco agora recusa concluir pelo
 * navegador (gatilho `vendas_conclusao_guarda`).
 *
 * A regra da série continua valendo, só que lá: venda de encomenda nasce sem
 * série; quem digita o IMEI é o estoque, na unidade, quando a caixa chega. Só
 * preenche o que está vazio.
 */
export async function concluirEncomenda(
  supabase: SupabaseClient,
  vendaId: number,
  opcoes: { pagamentos?: PagamentoNaEntrega[]; acessorios?: AcessorioNaEntrega[]; origem: 'encomenda' | 'historico' },
): Promise<ResultadoConcluir> {
  const { data, error } = await supabase.rpc('concluir_encomenda', {
    p_venda_id: vendaId,
    p_pagamentos: (opcoes.pagamentos ?? []).filter((p) => p.valor > 0.005),
    p_acessorios: opcoes.acessorios ?? [],
    p_origem: opcoes.origem,
  } as never)
  if (error) return { ok: false, erro: error.message, vendaIds: [], baixou: 0 }
  const d = (data ?? {}) as { venda_ids?: number[]; baixou?: number }
  return { ok: true, vendaIds: d.venda_ids ?? [vendaId], baixou: Number(d.baixou) || 0 }
}
