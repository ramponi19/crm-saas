import type { SupabaseClient } from '@supabase/supabase-js'

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
 *   3. ENTREGAR (`finalizarEncomenda` aqui embaixo)
 *      a venda vira `concluida`, a unidade baixa, e aí sim conta no faturamento.
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

export type StatusEncomenda = 'encomenda' | 'pendente_entrega'

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

/** Meia-noite local do dia de uma data `YYYY-MM-DD`, sem escorregar de fuso. */
function diaLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}

/**
 * O que mostrar para esta encomenda, e com qual cor.
 *
 * ⚠️ A COMPARAÇÃO É DE DIA, NÃO DE INSTANTE. `new Date('2026-09-18')` é
 * meia-noite UTC, que em Brasília é dia 17 às 21h: comparado com "agora", o
 * prazo aparece vencido um dia antes da hora — e quem recebe a cobrança é o
 * vendedor. Mesma armadilha já paga em `lib/chave-imovel.ts`.
 *
 * "Chegou" vence o prazo: uma encomenda que já está na loja não é atrasada, é
 * uma entrega esperando o cliente aparecer.
 */
export function diagnosticar(e: EncomendaAberta, hoje = new Date()): Diagnostico {
  if (e.status_pedido === 'recebido' || e.unidade_id != null) {
    return { situacao: 'chegou', dias: null, rotulo: 'Chegou — avisar o cliente', tom: 'ok' }
  }
  if (!e.previsao_entrega) {
    return { situacao: 'sem_prazo', dias: null, rotulo: 'Sem prazo combinado', tom: 'neutro' }
  }

  const alvo = diaLocal(e.previsao_entrega)
  const agora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const dias = Math.round((agora.getTime() - alvo.getTime()) / 86_400_000)

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
export function ordenarPorUrgencia<T extends EncomendaAberta>(lista: T[], hoje = new Date()): T[] {
  const peso: Record<Situacao, number> = {
    atrasada: 0, vence_hoje: 1, chegou: 2, sem_prazo: 3, no_prazo: 4,
  }
  return [...lista].sort((a, b) => {
    const da = diagnosticar(a, hoje)
    const db = diagnosticar(b, hoje)
    if (peso[da.situacao] !== peso[db.situacao]) return peso[da.situacao] - peso[db.situacao]
    // Dentro do mesmo grupo: o mais vencido (ou o que vence antes) na frente.
    return (db.dias ?? -9999) - (da.dias ?? -9999)
  })
}

export interface ResultadoFinalizar {
  ok: boolean
  erro?: string
  /** Houve baixa de unidade do estoque. */
  baixouEstoque: boolean
  /** A série foi copiada da unidade para a venda nesta finalização. */
  copiouSerie: boolean
  /** O recebimento do saldo foi gravado em `vendas_pagamentos`. */
  registrouPagamento: boolean
}

/** O dinheiro que entra NA ENTREGA — o saldo que faltava. */
export interface PagamentoNaEntrega {
  forma: string
  valor: number
  parcelas?: number | null
  empresaId: number
}

/**
 * ENTREGAR: a venda pendente vira concluída e a unidade baixa do estoque.
 *
 * Extraído de `historico-view.tsx` sem mudar a regra — inclusive a do IMEI, que
 * é o motivo de isto não poder ser reescrito em outro lugar:
 *
 * ⚠️ A SÉRIE DO APARELHO SÓ EXISTE AQUI. Venda de encomenda nasce sem série —
 * no ato do pedido o aparelho ainda não existe. Quem digita o IMEI é o estoque,
 * na unidade, quando a caixa chega. Se ninguém copiar para a venda, a loja fica
 * com uma venda concluída sem identificar o que saiu: consulta de garantia por
 * IMEI não acha, e o termo de garantia sai sem número de série.
 *
 * Só preenche o que está VAZIO: série já registrada no PDV não é sobrescrita.
 */
export async function finalizarEncomenda(
  supabase: SupabaseClient,
  vendaId: number,
  pagamento?: PagamentoNaEntrega | null,
): Promise<ResultadoFinalizar> {
  const { data: v } = await supabase.from('vendas')
    .select('unidade_id, numero_serie, inventario_unidades!vendas_unidade_id_fkey(imei, numero_serie)')
    .eq('id', vendaId).maybeSingle()

  const uni = Array.isArray(v?.inventario_unidades) ? v?.inventario_unidades[0] : v?.inventario_unidades
  const serieDaUnidade = uni?.imei || uni?.numero_serie || null
  const copiouSerie = !v?.numero_serie && !!serieDaUnidade

  const patch: {
    status: string; data_venda: string; numero_serie?: string
    forma_pagamento?: string; parcelas?: number
  } = {
    status: 'concluida',
    // A data da venda passa a ser a da ENTREGA: é quando o dinheiro entra e é
    // por ela que o faturamento do mês conta.
    data_venda: new Date().toISOString(),
  }
  if (copiouSerie) patch.numero_serie = serieDaUnidade as string

  /**
   * ⚠️ O DINHEIRO DA ENTREGA PRECISA SER GRAVADO AQUI.
   *
   * Até 15/09/2026 não era: as 11 encomendas já entregues da JM, R$ 84.540 de
   * faturamento, estavam TODAS com `vendas_pagamentos` vazio e `forma_pagamento`
   * nulo. A venda virava concluída e contava no faturamento, mas nenhum
   * relatório por forma de pagamento — fechamento de caixa, conciliação de taxa
   * de cartão — enxergava um centavo dela.
   *
   * O saldo é recebido justamente neste momento: a entrada (se houve) entrou no
   * lançamento, o resto entra agora. Por isso a forma vai junto na venda também,
   * como em qualquer venda do PDV.
   */
  if (pagamento && pagamento.valor > 0.005) {
    patch.forma_pagamento = pagamento.forma
    if (pagamento.parcelas && pagamento.parcelas > 1) patch.parcelas = pagamento.parcelas
  }

  const { error } = await supabase.from('vendas').update(patch as never).eq('id', vendaId)
  if (error) return { ok: false, erro: error.message, baixouEstoque: false, copiouSerie: false, registrouPagamento: false }

  let registrouPagamento = false
  if (pagamento && pagamento.valor > 0.005) {
    const { error: ePag } = await supabase.from('vendas_pagamentos').insert({
      empresa_id: pagamento.empresaId,
      venda_id: vendaId,
      forma_pagamento: pagamento.forma,
      valor_pago: pagamento.valor,
      parcelas: pagamento.parcelas && pagamento.parcelas > 1 ? pagamento.parcelas : null,
    } as never)
    // A venda JÁ está concluída: falhar aqui não desfaz a entrega, que é fato
    // consumado no balcão. Quem chamou avisa para lançar o pagamento à mão.
    registrouPagamento = !ePag
  }

  if (v?.unidade_id) {
    await supabase.from('inventario_unidades').update({ status: 'vendido' } as never).eq('id', v.unidade_id)
  }
  return { ok: true, baixouEstoque: !!v?.unidade_id, copiouSerie, registrouPagamento }
}
