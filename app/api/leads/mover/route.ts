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
    // Entrou em etapa de NEGOCIAÇÃO → cria um orçamento em rascunho vinculado
    // ao lead (opção A), se ainda não houver um em aberto. Não quebra o move.
    try {
      const { data: etapas } = await supabase.from('funil_etapas').select('tipo').eq('empresa_id', empresaId).eq('slug', body.kanban_status).limit(1)
      if (etapas?.[0]?.tipo === 'negociacao') {
        const { data: aberto } = await supabase.from('orcamentos').select('id').eq('lead_id', body.leadId).in('status', ['rascunho', 'enviado']).limit(1)
        if (!aberto?.length) {
          await supabase.from('orcamentos').insert({
            empresa_id: empresaId, lead_id: body.leadId,
            cliente_nome: leadAtual.nome || 'Lead',
            cliente_telefone: leadAtual.telefone ?? null,
            tipo: 'venda', status: 'rascunho', total: 0,
          } as never)
        }
      }
    } catch (e) {
      console.error('[leads/mover] orçamento de negociação falhou:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
