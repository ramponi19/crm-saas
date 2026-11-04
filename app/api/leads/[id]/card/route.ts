import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { carregarCardDoLead, gravarCardDoLead, type AlteracaoDoCard } from '@/lib/card-do-lead'

/**
 * O card do lead lê e grava direto no core (lib/card-do-lead.ts), sem a view
 * `leads`. A RLS do usuário decide o que ele vê e grava: vendedor só a loja dele.
 */

async function contexto(params: Promise<{ id: string }>) {
  const { id } = await params
  const leadId = Number(id)
  if (!Number.isInteger(leadId) || leadId <= 0) return { erro: NextResponse.json({ error: 'ID inválido' }, { status: 400 }) }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  return { leadId, db, userId: user.id }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexto(params)
  if ('erro' in ctx) return ctx.erro
  const card = await carregarCardDoLead(ctx.db, createServiceClient(), ctx.leadId)
  if (!card) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  return NextResponse.json(card)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexto(params)
  if ('erro' in ctx) return ctx.erro
  const alt = (await req.json().catch(() => null)) as AlteracaoDoCard | null
  if (!alt || typeof alt !== 'object') return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })

  const svc = createServiceClient()
  const r = await gravarCardDoLead(ctx.db, svc, ctx.leadId, ctx.userId, alt)
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status ?? (r.error === 'Lead não encontrado' ? 404 : 400) })
  const card = await carregarCardDoLead(ctx.db, svc, ctx.leadId)
  return NextResponse.json({ ...card, assumido: r.assumido, responsavelId: r.responsavelId })
}
