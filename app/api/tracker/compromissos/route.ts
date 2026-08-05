import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Compromissos do Tracker — agenda montada sobre `tarefas` (dados reais do CRM).
 * GET  → lista tarefas (com nome do lead vinculado).
 * POST → cria um compromisso (responsável = usuário logado).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  const { data } = await db.from('tarefas')
    .select('id, titulo, descricao, tipo, vencimento, concluida, lead_id, leads(nome, telefone)')
    .eq('empresa_id', empresaId)
    .order('vencimento', { ascending: true, nullsFirst: false })
    .limit(200)

  type Row = {
    id: number; titulo: string | null; descricao: string | null; tipo: string | null
    vencimento: string | null; concluida: boolean | null; lead_id: number | null
    leads: { nome: string | null; telefone: string | null } | { nome: string | null; telefone: string | null }[] | null
  }
  const compromissos = ((data ?? []) as Row[]).map((t) => {
    const lead = Array.isArray(t.leads) ? t.leads[0] : t.leads
    return {
      id: t.id, titulo: t.titulo || 'Sem título', descricao: t.descricao, tipo: t.tipo || 'tarefa',
      vencimento: t.vencimento, concluida: !!t.concluida,
      lead_id: t.lead_id, lead_nome: lead?.nome ?? null, lead_tel: lead?.telefone ?? null,
    }
  })
  return NextResponse.json({ compromissos })
}

export async function POST(req: Request) {
  const { empresaId, userId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const titulo = String(body.titulo ?? '').trim()
  const venc = String(body.vencimento ?? '').trim()
  if (!titulo) return NextResponse.json({ error: 'titulo_obrigatorio' }, { status: 400 })

  const db = rastrDb()
  const { data, error } = await db.from('tarefas').insert({
    empresa_id: empresaId, responsavel_id: userId, titulo,
    descricao: String(body.descricao ?? '').trim() || null,
    tipo: String(body.tipo ?? 'tarefa'),
    vencimento: venc ? new Date(venc).toISOString() : null,
    lead_id: body.lead_id ? Number(body.lead_id) : null,
    concluida: false,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data?.id })
}
