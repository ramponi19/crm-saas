import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Motor de automações de etapa (Fase 4.3).
 *
 * IMPORTANTE (Meta): as ações NUNCA enviam mensagem — só criam TAREFAS internas.
 * "enviar_whatsapp_template" vira uma tarefa com a mensagem já renderizada, para
 * o vendedor enviar manualmente. Isso preserva o fluxo de recebimento da Meta.
 */

export interface LeadMin {
  id: number
  nome: string | null
  responsavel_id: string | null
}

// Cliente genérico (aceita nomes de tabela dinâmicos). O escopo por empresa é
// garantido por RLS (client autenticado) ou pelo empresa_id passado (service).
type Db = SupabaseClient

export interface AutomacaoRow {
  id: number
  etapa_slug: string | null
  gatilho: string
  horas: number | null
  acao: string
  config: Record<string, unknown> | null
}

function render(texto: string, lead: LeadMin): string {
  return texto.replace(/\{\{nome\}\}/g, lead.nome ?? '').trim()
}

/** Executa UMA ação de automação criando a tarefa correspondente. */
export async function executarAcao(db: Db, empresaId: number, lead: LeadMin, acao: string, config: Record<string, unknown>) {
  const nowIso = new Date().toISOString()

  if (acao === 'enviar_whatsapp_template') {
    let corpo = ''
    const chave = config.template_chave as string | undefined
    if (chave) {
      const { data } = await db.from('configuracoes_sistema')
        .select('valor').eq('empresa_id', empresaId).eq('chave', 'mensagens_templates').maybeSingle()
      const tmpls = (data?.valor ?? {}) as Record<string, string>
      corpo = render(tmpls[chave] ?? '', lead)
    }
    const titulo = `Enviar WhatsApp para ${lead.nome ?? 'lead'}${corpo ? `: ${corpo.slice(0, 140)}` : ''}`
    await db.from('tarefas').insert({ empresa_id: empresaId, lead_id: lead.id, responsavel_id: lead.responsavel_id, titulo, tipo: 'ligacao', vencimento: nowIso })
    return
  }

  if (acao === 'notificar_gestor') {
    const { data: gestores } = await db.from('empresa_usuarios')
      .select('usuario_id').eq('empresa_id', empresaId).in('role', ['owner', 'admin']).eq('ativo', true).limit(1)
    const gestorId = (gestores?.[0] as { usuario_id: string } | undefined)?.usuario_id ?? lead.responsavel_id
    const titulo = render((config.titulo as string) || `Atenção com o lead ${lead.nome ?? ''}`, lead)
    await db.from('tarefas').insert({ empresa_id: empresaId, lead_id: lead.id, responsavel_id: gestorId, titulo, tipo: 'ligacao', vencimento: nowIso })
    return
  }

  // criar_tarefa (padrão)
  const titulo = render((config.titulo as string) || `Ação: lead ${lead.nome ?? ''}`, lead)
  const tipo = (config.tipo as string) || 'ligacao'
  await db.from('tarefas').insert({ empresa_id: empresaId, lead_id: lead.id, responsavel_id: lead.responsavel_id, titulo, tipo, vencimento: nowIso })
}

/** Dispara as automações de "entrou_na_etapa" ao mover um lead para `etapaSlug`. */
export async function executarEntradaEtapa(db: Db, empresaId: number, lead: LeadMin, etapaSlug: string) {
  const { data } = await db.from('automacoes')
    .select('id, etapa_slug, acao, config')
    .eq('empresa_id', empresaId).eq('gatilho', 'entrou_na_etapa').eq('ativo', true)
  for (const a of (data ?? []) as AutomacaoRow[]) {
    if (a.etapa_slug && a.etapa_slug !== etapaSlug) continue
    try {
      await executarAcao(db, empresaId, lead, a.acao, a.config ?? {})
    } catch (e) {
      console.error('[automacoes] falha na ação', a.id, e)
    }
  }
}
