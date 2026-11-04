import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { executarEntradaEtapa } from '@/lib/automacoes'
import { inscreverPorEtapa } from '@/lib/cadencia'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nadaGravado, SEM_PERMISSAO_CONTATO, SEM_PERMISSAO_NEGOCIO } from '@/lib/linhas-afetadas'

/** `string`, não literal: o parser de tipos do supabase-js estoura com relação embutida. */
const SELECT_NEGOCIO: string = 'id, empresa_id, funil_id, responsavel_id, perdido_em, dados, etapa:funil_etapas!negocios_etapa_id_fkey(slug), contato:contatos!negocios_contato_id_fkey(id, nome, observacoes)'

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
    /**
     * Justificativa da perda arrastada no quadro: emendada AQUI ao fim das
     * observações do contato, com rótulo e data. O cartão do quadro não traz as
     * observações (04/11/2026), então montar o texto lá apagaria o que já havia.
     */
    justificativa?: string
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

  /**
   * O negócio, direto no core (03/11/2026: a rota deixou a view `leads`). A RLS
   * garante que é da empresa — e, para o vendedor, da loja dele. A etapa sai como
   * o gatilho da view a resolvia (`compat_etapa`): pelo slug, no funil do negócio
   * (ou no padrão, fora o interno); etapa de ganho/perda define o status; slug
   * que o funil não tem fica guardado em `dados._lead.kanban_status`, como antes.
   */
  type NegocioAtual = {
    id: number; empresa_id: number; funil_id: number | null; responsavel_id: string | null; perdido_em: string | null
    dados: Record<string, unknown> | null; etapa: { slug: string } | null
    contato: { id: number; nome: string | null; observacoes: string | null } | null
  }
  const { data: negocio } = await supabase
    .from('negocios')
    .select(SELECT_NEGOCIO)
    .eq('id', body.leadId)
    .maybeSingle()
  const n = negocio as unknown as NegocioAtual | null
  if (!n) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  const dadosLead = ((n.dados ?? {})._lead ?? {}) as Record<string, unknown>
  const leadAtual = {
    id: n.id, nome: n.contato?.nome ?? null, responsavel_id: n.responsavel_id,
    kanban_status: n.etapa?.slug ?? (dadosLead.kanban_status as string | undefined) ?? 'novo',
  }

  let funilAlvo = funilNovo ?? n.funil_id
  if (funilAlvo == null) {
    const { data: padrao } = await supabase.from('funis').select('id')
      .eq('empresa_id', n.empresa_id).eq('padrao', true).eq('interno', false).order('id').limit(1).maybeSingle()
    funilAlvo = padrao?.id ?? null
  }
  const { data: etapaRow } = funilAlvo == null ? { data: null } : await supabase.from('funil_etapas')
    .select('id, tipo').eq('funil_id', funilAlvo).eq('slug', etapa).maybeSingle()
  const status = etapaRow?.tipo === 'ganho' ? 'ganho'
    : etapaRow?.tipo === 'perdido' ? 'perdido'
    : !etapaRow && (body.perdido_em ?? n.perdido_em) ? 'perdido' : 'aberto'

  const patch: Record<string, unknown> = {
    funil_id: funilAlvo,
    etapa_id: etapaRow?.id ?? null,
    status,
    entrou_etapa_em: new Date().toISOString(),
  }
  if (!etapaRow) patch.dados = { ...(n.dados ?? {}), _lead: { ...dadosLead, kanban_status: etapa } }
  if (body.motivo_perda_id != null) patch.motivo_perda_id = body.motivo_perda_id
  if (body.perdido_em) patch.perdido_em = body.perdido_em

  /**
   * A justificativa da perda mora nas observações do contato (onde o vendedor a lê).
   * Grava ANTES do negócio e confere as linhas (04/11/2026): com RLS, UPDATE barrado
   * afeta 0 linhas sem erro — a rota dizia "ok", o lead ia para Perdido e a
   * justificativa sumia (contato de uma loja, negócio na outra). Agora, se o
   * contato não aceita a gravação, nada se move e a tela mostra o motivo.
   */
  const justificativa = body.justificativa?.trim()
  const observacoes = body.observacoes ?? (justificativa
    ? (n.contato?.observacoes ? n.contato.observacoes + '\n' : '')
      + `Justificativa da perda (${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}): ${justificativa}`
    : null)
  if (observacoes && n.contato) {
    const { data: obsGravada, error: errObs } = await supabase.from('contatos').update({ observacoes }).eq('id', n.contato.id).select('id')
    if (errObs) return NextResponse.json({ error: errObs.message }, { status: 500 })
    if (nadaGravado(obsGravada)) return NextResponse.json({ error: SEM_PERMISSAO_CONTATO }, { status: 403 })
  }

  const { data: movido, error } = await supabase.from('negocios').update(patch as never).eq('id', n.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (nadaGravado(movido)) return NextResponse.json({ error: SEM_PERMISSAO_NEGOCIO }, { status: 403 })

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
