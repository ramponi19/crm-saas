import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { executarEntradaEtapa } from '@/lib/automacoes'
import { inscreverPorEtapa } from '@/lib/cadencia'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Move um lead de etapa e dispara as automações de "entrou_na_etapa".
 * Substitui o update direto do kanban para que o motor de eventos rode no
 * servidor. RLS escopa tudo à empresa do usuário (impersonação respeitada).
 */
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    leadId?: number
    kanban_status?: string
    /** Troca de funil (15/10/2026): o lead entra na primeira etapa do funil novo. */
    funilId?: number
    motivo_perda_id?: number | null
    perdido_em?: string | null
    observacoes?: string
  }
  if (!body.leadId || (!body.kanban_status && !body.funilId)) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  /**
   * TROCA DE FUNIL. Não existia: o modal só mudava a etapa DENTRO do funil do
   * lead, então um funil novo (ex.: "Equipe", para as conversas internas que
   * ficam fora do ZapIntel) nascia sem jeito de receber lead. O lead entra na
   * primeira etapa ativa do funil escolhido. RLS garante que é da empresa.
   */
  let funilNovo: number | null = null
  if (body.funilId) {
    const { data: funil } = await supabase.from('funis').select('id').eq('id', body.funilId).maybeSingle()
    if (!funil) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
    const { data: primeira } = await supabase.from('funil_etapas').select('slug')
      .eq('funil_id', body.funilId).eq('ativo', true).order('ordem').limit(1).maybeSingle()
    if (!primeira) return NextResponse.json({ error: 'Este funil não tem etapas ativas' }, { status: 400 })
    funilNovo = funil.id
    body.kanban_status = body.kanban_status ?? primeira.slug
  }
  const etapa = body.kanban_status as string

  // Lead atual (RLS garante que é da empresa do usuário).
  const { data: leadAtual } = await supabase
    .from('leads')
    .select('id, nome, telefone, responsavel_id, kanban_status, funil_id, motivo_perda_id, perdido_em')
    .eq('id', body.leadId)
    .maybeSingle()
  if (!leadAtual) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  /**
   * A etapa de destino precisa existir no funil do lead.
   *
   * Antes qualquer texto era aceito: uma etapa de OUTRO funil (mandada junto com
   * `funilId`) ou digitada errada gravava o lead numa coluna que nao existe, e ele
   * sumia do quadro. Empresa sem etapas cadastradas usa as colunas padrao da tela,
   * e ai so o slug decide se e perda.
   */
  const funilFinal = funilNovo ?? leadAtual.funil_id
  const { data: etapasRaw } = await supabase.from('funil_etapas')
    .select('slug, tipo, funil_id').eq('empresa_id', empresaId).eq('ativo', true)
  const etapas = (etapasRaw ?? []) as { slug: string; tipo: string; funil_id: number | null }[]
  let tipoEtapa = etapa === 'perdido' ? 'perdido' : ''
  if (etapas.length > 0) {
    const doFunil = etapas.filter((e) => funilFinal == null || e.funil_id == null || e.funil_id === funilFinal)
    const alvo = doFunil.find((e) => e.slug === etapa)
    if (!alvo) return NextResponse.json({ error: 'Etapa não encontrada neste funil' }, { status: 400 })
    tipoEtapa = alvo.tipo
  }

  /**
   * Perda exige motivo — a regra estava so na tela. Um POST direto mandava o lead
   * para Perdido sem motivo, e o relatorio de perdas o contava como "nao perdido".
   * O motivo e conferido pela RLS: so passa motivo da propria empresa.
   */
  const viraPerda = tipoEtapa === 'perdido'
  if (viraPerda) {
    if (body.motivo_perda_id == null) {
      return NextResponse.json({ error: 'Informe o motivo da perda' }, { status: 400 })
    }
    const { data: motivo } = await supabase.from('motivos_perda').select('id')
      .eq('id', body.motivo_perda_id).eq('empresa_id', empresaId).maybeSingle()
    if (!motivo) return NextResponse.json({ error: 'Motivo de perda inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    kanban_status: etapa,
    data_transferencia_funil: new Date().toISOString(),
  }
  if (funilNovo != null) patch.funil_id = funilNovo
  if (viraPerda) {
    patch.motivo_perda_id = body.motivo_perda_id
    patch.perdido_em = body.perdido_em || new Date().toISOString()
  } else if (leadAtual.motivo_perda_id != null || leadAtual.perdido_em != null) {
    // Lead que sai da perda deixa de ser perdido. Sem isto o motivo e a data
    // ficavam, e o assistente e o ZapIntel continuavam contando-o como perdido.
    patch.motivo_perda_id = null
    patch.perdido_em = null
  }
  if (body.observacoes) patch.observacoes = body.observacoes

  const { error } = await supabase.from('leads').update(patch as never).eq('id', body.leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Automações e cadências de entrada — só se a etapa realmente mudou.
  if (leadAtual.kanban_status !== etapa) {
    const db = supabase as unknown as SupabaseClient
    const leadMin = { id: leadAtual.id, nome: leadAtual.nome, responsavel_id: leadAtual.responsavel_id }
    try {
      await executarEntradaEtapa(db, empresaId, leadMin, etapa)
    } catch (e) {
      // Automação nunca quebra o move.
      console.error('[leads/mover] automações falharam:', e)
    }
    try {
      await inscreverPorEtapa(db, empresaId, leadMin, etapa)
    } catch (e) {
      // Cadência nunca quebra o move.
      console.error('[leads/mover] cadências falharam:', e)
    }
    /**
     * REMOVIDO: criação automática de orçamento ao entrar em Negociação.
     *
     * A ideia era adiantar trabalho — o lead chega em Negociação e já encontra um
     * orçamento pronto para preencher. O resultado foi outro: 31 de 31 orçamentos
     * da JM eram rascunhos de R$ 0,00, SEM UM ÚNICO ITEM, e nenhum orçamento real
     * chegou a ser criado no período.
     *
     * O que isso produzia:
     *  - a tela de Orçamentos virou uma lista de nada, e lista cheia de vazio é o
     *    que ensina a equipe a não abrir a tela;
     *  - "orçamentos em aberto" deixou de significar negociação em andamento:
     *    virava 1 por lead movido, inflando qualquer contagem;
     *  - o vendedor que de fato quisesse orçar encontrava um rascunho fantasma no
     *    caminho, sem saber se era dele ou de um colega.
     *
     * O caminho certo já existe e é explícito: o painel de Orçamento dentro do lead
     * cria quando alguém DECIDE orçar — e ao salvar move o lead para a etapa de
     * orçamento. Intenção do vendedor, não efeito colateral de arrastar um card.
     */
  }

  return NextResponse.json({ ok: true, kanban_status: etapa, funil_id: funilNovo })
}
