import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolverCanalDaConversa } from '@/lib/canais/resolver-canal'

/**
 * GET — por onde responder este negócio (lib/canais/resolver-canal.ts): o canal sugerido, os
 * canais em que o cliente tem conversa na loja do card e a janela de 24 h de cada um. Lê com a
 * sessão de quem pergunta: vendedor só enxerga a loja dele (RLS).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const leadId = Number(id)
  if (!Number.isInteger(leadId) || leadId <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const r = await resolverCanalDaConversa(db, leadId)
  if (!r) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  return NextResponse.json(r)
}
