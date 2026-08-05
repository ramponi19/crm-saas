import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Mensagens de uma conversa (lead) do Inbox do Tracker + dados do painel CRM.
 * PATCH atribui/assume o responsável (Distribuir). Escopado à empresa ativa.
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId } = await trackerEmpresa()
  const { id } = await ctx.params
  const leadId = Number(id)
  const db = rastrDb()

  const { data: lead } = await db.from('leads')
    .select('id, nome, telefone, foto_url, origem, origem_id, kanban_status, valor_estimado, produto_interessado, responsavel_id')
    .eq('empresa_id', empresaId).eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 })

  const [{ data: msgs }, { data: etapa }] = await Promise.all([
    db.from('lead_mensagens').select('id, direcao, conteudo, tipo, midia_url, status_entrega, created_at').eq('empresa_id', empresaId).eq('lead_id', leadId).order('created_at', { ascending: true }).limit(500),
    lead.kanban_status ? db.from('funil_etapas').select('label').eq('empresa_id', empresaId).eq('slug', lead.kanban_status).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ])

  await db.from('lead_mensagens').update({ lida: true }).eq('empresa_id', empresaId).eq('lead_id', leadId).eq('direcao', 'recebida').eq('lida', false)
  await db.from('leads').update({ msgs_nao_lidas: 0 }).eq('empresa_id', empresaId).eq('id', leadId)

  return NextResponse.json({
    lead: {
      id: lead.id, nome: lead.nome || lead.telefone || 'Sem nome', telefone: lead.telefone,
      origem_id: lead.origem_id, foto_url: lead.foto_url, origem: lead.origem, status: lead.kanban_status,
      etapa_label: (etapa as { label: string } | null)?.label ?? null,
      valor: lead.valor_estimado != null ? Number(lead.valor_estimado) : null,
      produto: lead.produto_interessado, responsavel_id: lead.responsavel_id,
    },
    mensagens: msgs ?? [],
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId, userId } = await trackerEmpresa()
  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  // assumir=true → eu; responsavel_id explícito → atribui; null → devolve.
  let responsavel: string | null
  if (body.assumir) responsavel = userId
  else if ('responsavel_id' in body) responsavel = body.responsavel_id ? String(body.responsavel_id) : null
  else return NextResponse.json({ error: 'nada_a_fazer' }, { status: 400 })

  const db = rastrDb()
  const { error } = await db.from('leads').update({ responsavel_id: responsavel }).eq('empresa_id', empresaId).eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, responsavel_id: responsavel })
}
