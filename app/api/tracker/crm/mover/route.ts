import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Move um lead para outra etapa do funil (kanban do CRM do Tracker).
 * Atualiza kanban_status (= slug da etapa) e o funil, escopado à empresa.
 */
export async function PATCH(req: Request) {
  const { empresaId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const leadId = Number(body.leadId)
  const etapa = String(body.etapa ?? '').trim()
  if (!leadId || !etapa) return NextResponse.json({ error: 'parametros_invalidos' }, { status: 400 })

  const patch: Record<string, unknown> = { kanban_status: etapa }
  if (body.funilId) patch.funil_id = Number(body.funilId)

  const db = rastrDb()
  const { error } = await db.from('leads')
    .update(patch).eq('empresa_id', empresaId).eq('id', leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
