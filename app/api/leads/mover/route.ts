import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { executarEntradaEtapa } from '@/lib/automacoes'
import { createServiceClient } from '@/lib/supabase/service'
import { inscreverPorEtapa } from '@/lib/cadencia'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nadaGravado, SEM_PERMISSAO_CONTATO, SEM_PERMISSAO_NEGOCIO } from '@/lib/linhas-afetadas'
import { formatarData } from '@/lib/datas'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { diaNoFuso } from '@/lib/datas'
import { ganhoEmDaData, validarVendaGanho, type VendaInformada, modoCondicao } from '@/lib/venda-ganho'
import { camposDaVenda, validarCamposDaVenda } from '@/lib/venda-campos'

/** `string`, não literal: o parser de tipos do supabase-js estoura com relação embutida. */
const SELECT_NEGOCIO: string = 'id, empresa_id, funil_id, responsavel_id, status, ganho_em, perdido_em, created_at, dados, etapa:funil_etapas!negocios_etapa_id_fkey(slug), contato:contatos!negocios_contato_id_fkey(id, nome, observacoes)'

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
    /**
     * Tirar uma VENDA FECHADA do ganho (23/11/2026, migração 20261123000200): só pela RPC
     * `reabrir_negocio`, que exige dono/admin e este motivo. Sem ele a rota responde 409
     * com `codigo: 'GANHO_REABRIR'` e nada se move.
     */
    motivo_reabertura?: string
    /**
     * Os dados da VENDA, obrigatórios ao ENTRAR no ganho (23/11/2026, Entrega A do pós-venda):
     * data (vira `ganho_em`), categoria, condição e valor — lib/venda-ganho.ts. Sem eles a rota
     * responde 422 com `codigo: 'GANHO_DADOS'` e o campo que falta; nada se move.
     */
    venda?: VendaInformada
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
    status: string; ganho_em: string | null; created_at: string
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

  /**
   * A etapa de destino precisa existir no funil do negócio (porte do 58d7d3f).
   *
   * Antes qualquer texto era aceito: uma etapa de OUTRO funil ou digitada errada
   * gravava o negócio sem etapa, e ele sumia do quadro. O slug guardado em
   * `dados._lead.kanban_status` continua valendo só para funil sem etapa nenhuma.
   */
  if (!etapaRow && funilAlvo != null) {
    const { count: etapasDoFunil } = await supabase.from('funil_etapas')
      .select('id', { count: 'exact', head: true }).eq('funil_id', funilAlvo)
    if ((etapasDoFunil ?? 0) > 0) {
      return NextResponse.json({ error: 'Etapa não encontrada neste funil' }, { status: 400 })
    }
  }
  const status = etapaRow?.tipo === 'ganho' ? 'ganho'
    : etapaRow?.tipo === 'perdido' ? 'perdido'
    : !etapaRow && (body.perdido_em ?? n.perdido_em) ? 'perdido' : 'aberto'

  /**
   * VENDA FECHADA NÃO SAI DO GANHO PELO ARRASTO (23/11/2026). O banco recusa (gatilho
   * `negocios_ganho_protegido`); aqui a recusa vira uma resposta que a tela entende. Com o
   * motivo, a RPC confere a permissão (dono/admin), grava `reaberto_manual` no histórico e
   * devolve o negócio aberto na primeira etapa — daí em diante é um movimento comum.
   */
  const reabrindoVenda = n.status === 'ganho' && status !== 'ganho'
  const motivoReabertura = body.motivo_reabertura?.trim()
  if (reabrindoVenda && !motivoReabertura) {
    return NextResponse.json({
      error: 'Esta venda já está fechada. Para tirá-la do ganho, informe o motivo da reabertura (só dono ou administrador).',
      codigo: 'GANHO_REABRIR',
    }, { status: 409 })
  }

  /**
   * ENTRAR NO GANHO EXIGE A VENDA (23/11/2026). Qualquer tela que marca ganho passa por aqui
   * (quadro, ficha do lead, "Converter em cliente", ficha imobiliária): sem data, categoria,
   * condição e valor válidos, 422 e nada se move. Ganho → ganho (outra etapa de ganho) mantém tudo.
   */
  const entrandoNoGanho = status === 'ganho' && n.status !== 'ganho'
  let ganhoEmNovo: string | null = null
  let dadosVenda: Record<string, unknown> | null = null
  let valorVenda: number | null = null
  let camposVenda: Record<string, string | number> = {}
  if (entrandoNoGanho) {
    const fuso = await fusoDaEmpresa(supabase, empresaId)
    const [{ data: cats }, { data: modo }, { data: camposCfg }] = await Promise.all([
      // as categorias da venda da empresa: as do Estoque ou as próprias do Pós-venda (core_venda_categorias, 24/11/2026)
      supabase.rpc('core_venda_categorias' as never),
      // condição exigida | opcional | não usa, por empresa (core.condicao_venda; 24/11/2026)
      supabase.rpc('config_valor' as never, { p_modulo: 'core', p_chave: 'condicao_venda' } as never),
      // campos da venda que a empresa pede (os do Pós-venda, só com o módulo ligado; senão lista vazia)
      supabase.rpc('core_venda_campos' as never),
    ])
    const v = validarVendaGanho(body.venda, {
      hoje: diaNoFuso(new Date(), fuso),
      criadoEm: diaNoFuso(new Date(n.created_at), fuso),
      categorias: ((cats ?? []) as { id: number }[]).map((c) => Number(c.id)),
      condicao: modoCondicao(modo),
    })
    if (!v.ok) return NextResponse.json({ error: v.erro, codigo: 'GANHO_DADOS', campo: v.campo }, { status: 422 })
    const cs = validarCamposDaVenda(camposDaVenda(camposCfg), (body.venda as { campos?: unknown } | undefined)?.campos)
    if (!cs.ok) return NextResponse.json({ error: cs.erro, codigo: 'GANHO_DADOS', campo: cs.campo }, { status: 422 })
    camposVenda = cs.valores
    ganhoEmNovo = ganhoEmDaData(v.venda.data, fuso)
    valorVenda = v.venda.valor
    dadosVenda = {
      data: v.venda.data, categoria_id: v.venda.categoria_id, condicao: v.venda.condicao, valor: v.venda.valor,
      registrada_por: user.id, registrada_em: new Date().toISOString(),
    }
  }

  const agora = new Date().toISOString()
  const patch: Record<string, unknown> = {
    funil_id: funilAlvo,
    etapa_id: etapaRow?.id ?? null,
    status,
    entrou_etapa_em: agora,
    /**
     * A DATA DO GANHO acompanha o status (05/11/2026). Arrastar para a etapa de ganho
     * gravava só `status = 'ganho'`: 22 negócios ganhos entre 20/10 e 05/11 ficaram sem
     * `ganho_em`, e é por ela que a Edge decide se a mensagem de quem volta é pós-venda
     * (ganho há até N dias) ou abre negócio novo. Ganho → ganho mantém a data; sair do
     * ganho a limpa, como a reabertura pelo canal (`core_negocio_do_canal`) faz.
     */
    ganho_em: status === 'ganho' ? (n.status === 'ganho' && n.ganho_em ? n.ganho_em : (ganhoEmNovo ?? agora)) : null,
  }
  if (!etapaRow) {
    // Reabrindo, a RPC já tirou a venda do negócio (C4): o `dados` lido antes dela não a traz de volta
    // (o banco recusaria — VENDA_SO_POR_RPC, 24/11/2026).
    const base: Record<string, unknown> = { ...((n.dados ?? {}) as Record<string, unknown>) }
    if (reabrindoVenda) delete base.venda
    patch.dados = { ...base, _lead: { ...dadosLead, kanban_status: etapa } }
  }
  // A venda informada: valor do negócio e `dados.venda` (data, categoria, condição, valor, quem e quando).
  if (dadosVenda) {
    patch.valor_estimado = valorVenda
    patch.dados = { ...((patch.dados as Record<string, unknown> | undefined) ?? n.dados ?? {}), ...camposVenda, venda: dadosVenda }
  }

  /**
   * Perda exige motivo da EMPRESA — a regra estava só na tela (porte do 58d7d3f).
   * Um POST direto mandava o negócio para Perdido sem motivo, e o relatório de
   * perdas o contava sem causa. Sair da perda limpa motivo e data: sem isso o
   * ZapIntel e o assistente continuavam contando-o como perdido.
   */
  if (status === 'perdido') {
    if (body.motivo_perda_id == null) {
      return NextResponse.json({ error: 'Informe o motivo da perda' }, { status: 400 })
    }
    const { data: motivo } = await supabase.from('motivos_perda').select('id')
      .eq('id', body.motivo_perda_id).eq('empresa_id', n.empresa_id).maybeSingle()
    if (!motivo) return NextResponse.json({ error: 'Motivo de perda inválido' }, { status: 400 })
    patch.motivo_perda_id = body.motivo_perda_id
    patch.perdido_em = body.perdido_em || (n.status === 'perdido' && n.perdido_em ? n.perdido_em : agora)
  } else {
    patch.motivo_perda_id = null
    patch.perdido_em = null
  }

  /**
   * A justificativa da perda mora nas observações do contato (onde o vendedor a lê).
   * Grava ANTES do negócio e confere as linhas (04/11/2026): com RLS, UPDATE barrado
   * afeta 0 linhas sem erro — a rota dizia "ok", o lead ia para Perdido e a
   * justificativa sumia (contato de uma loja, negócio na outra). Agora, se o
   * contato não aceita a gravação, nada se move e a tela mostra o motivo.
   */
  // A reabertura da venda é a PRIMEIRA gravação: tudo o que podia recusar o movimento (etapa,
  // motivo de perda) já foi conferido acima, então não sobra venda reaberta sem movimento.
  if (reabrindoVenda) {
    const { error: errReabrir } = await supabase.rpc('reabrir_negocio', { p_negocio: n.id, p_motivo: motivoReabertura ?? '' })
    if (errReabrir) {
      const semPermissao = errReabrir.message.includes('SEM_PERMISSAO')
      return NextResponse.json({
        error: semPermissao ? 'Só o dono ou um administrador reabre uma venda fechada.' : errReabrir.message,
        codigo: semPermissao ? 'GANHO_SEM_PERMISSAO' : 'GANHO_REABRIR_FALHOU',
      }, { status: semPermissao ? 403 : 400 })
    }
  }

  const justificativa = body.justificativa?.trim()
  const observacoes = body.observacoes ?? (justificativa
    ? (n.contato?.observacoes ? n.contato.observacoes + '\n' : '')
      + `Justificativa da perda (${formatarData(agora, undefined, '', await fusoDaEmpresa(supabase, empresaId))}): ${justificativa}`
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
      // Automatize (04/11/2026): a fila `automacao_execucoes` só aceita a chave de
      // serviço; quem move já foi autorizado acima (o negócio gravou pela RLS dele).
      await executarEntradaEtapa(createServiceClient() as unknown as SupabaseClient, empresaId, leadMin, etapa, etapaRow?.id ?? null)
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
