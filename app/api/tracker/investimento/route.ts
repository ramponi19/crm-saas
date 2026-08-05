import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Investimento de anúncio (Tracker) — entrada manual de gasto por dia/campanha.
 * GET  → lançamentos + total no período.
 * POST → upsert de um lançamento (soma no CAC/ROAS do Dashboard).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const { data } = await db.from('tracker_investimento')
    .select('id, dia, campanha, gasto, fonte').eq('empresa_id', empresaId).gte('dia', desde)
    .order('dia', { ascending: false }).limit(200)

  const lancamentos = (data ?? []) as { id: number; dia: string; campanha: string; gasto: number; fonte: string }[]
  const total = lancamentos.reduce((s, l) => s + (Number(l.gasto) || 0), 0)
  return NextResponse.json({ total, lancamentos })
}

export async function POST(req: Request) {
  const { empresaId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const dia = String(body.dia ?? '').trim()
  const gasto = Number(body.gasto)
  if (!dia || !Number.isFinite(gasto) || gasto < 0) return NextResponse.json({ error: 'dados_invalidos' }, { status: 400 })
  const campanha = String(body.campanha ?? '').trim() || '(geral)'

  const db = rastrDb()
  const { error } = await db.from('tracker_investimento').upsert({
    empresa_id: empresaId, dia, campanha, gasto, fonte: 'manual', atualizado_em: new Date().toISOString(),
  }, { onConflict: 'empresa_id,dia,campanha' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
