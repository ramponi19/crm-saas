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
    motivo_perda_id?: number | null
    perdido_em?: string | null
    observacoes?: string
  }
  if (!body.leadId || !body.kanban_status) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  // Lead atual (RLS garante que é da empresa do usuário).
  const { data: leadAtual } = await supabase
    .from('leads')
    .select('id, nome, telefone, responsavel_id, kanban_status')
    .eq('id', body.leadId)
    .maybeSingle()
  if (!leadAtual) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const patch: Record<string, unknown> = {
    kanban_status: body.kanban_status,
    data_transferencia_funil: new Date().toISOString(),
  }
  if (body.motivo_perda_id != null) patch.motivo_perda_id = body.motivo_perda_id
  if (body.perdido_em) patch.perdido_em = body.perdido_em
  if (body.observacoes) patch.observacoes = body.observacoes

  const { error } = await supabase.from('leads').update(patch as never).eq('id', body.leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Automações e cadências de entrada — só se a etapa realmente mudou.
  if (leadAtual.kanban_status !== body.kanban_status) {
    const db = supabase as unknown as SupabaseClient
    const leadMin = { id: leadAtual.id, nome: leadAtual.nome, responsavel_id: leadAtual.responsavel_id }
    try {
      await executarEntradaEtapa(db, empresaId, leadMin, body.kanban_status)
    } catch (e) {
      // Automação nunca quebra o move.
      console.error('[leads/mover] automações falharam:', e)
    }
    try {
      await inscreverPorEtapa(db, empresaId, leadMin, body.kanban_status)
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

  return NextResponse.json({ ok: true })
}
