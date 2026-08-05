import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Lista de conversas do Inbox do Tracker — dados reais de `leads` + preview da
 * última mensagem de `lead_mensagens`. Escopado à empresa ativa do usuário.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  const { data: leads } = await db.from('leads')
    .select('id, nome, telefone, foto_url, origem, kanban_status, msgs_nao_lidas, ultima_mensagem_at, primeira_msg, origem_id')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .order('ultima_mensagem_at', { ascending: false, nullsFirst: false })
    .limit(80)

  const lista = (leads ?? []) as Array<{
    id: number; nome: string | null; telefone: string | null; foto_url: string | null;
    origem: string | null; kanban_status: string | null; msgs_nao_lidas: number | null;
    ultima_mensagem_at: string | null; primeira_msg: string | null; origem_id: string | null
  }>

  // Preview: última mensagem de cada conversa (1 query, dedupe em memória).
  const ids = lista.map((l) => l.id)
  const preview = new Map<number, { conteudo: string; direcao: string; created_at: string }>()
  if (ids.length) {
    const { data: msgs } = await db.from('lead_mensagens')
      .select('lead_id, conteudo, direcao, created_at')
      .eq('empresa_id', empresaId).in('lead_id', ids)
      .order('created_at', { ascending: false }).limit(400)
    for (const m of (msgs ?? []) as Array<{ lead_id: number; conteudo: string; direcao: string; created_at: string }>) {
      if (!preview.has(m.lead_id)) preview.set(m.lead_id, { conteudo: m.conteudo, direcao: m.direcao, created_at: m.created_at })
    }
  }

  const conversas = lista.map((l) => {
    const p = preview.get(l.id)
    return {
      id: l.id,
      nome: l.nome || l.telefone || l.origem_id || 'Sem nome',
      telefone: l.telefone,
      foto_url: l.foto_url,
      origem: l.origem || 'whatsapp',
      status: l.kanban_status,
      nao_lidas: l.msgs_nao_lidas ?? 0,
      preview: p?.conteudo ?? l.primeira_msg ?? '',
      preview_saida: p?.direcao === 'enviada',
      ts: p?.created_at ?? l.ultima_mensagem_at,
    }
  })

  return NextResponse.json({ conversas })
}
