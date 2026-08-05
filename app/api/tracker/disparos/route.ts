import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Campanhas de disparo (Tracker). GET lista; POST cria e já calcula o público-alvo.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const { data } = await db.from('tracker_disparo')
    .select('id, nome, status, mensagem, publico_tipo, publico_valor, total_alvos, enviados, agendado_para, criado_em')
    .eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(100)
  return NextResponse.json({ campanhas: data ?? [] })
}

async function contarPublico(empresaId: number, tipo: string, valor: string | null): Promise<number> {
  const db = rastrDb()
  let q = db.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true)
  if (tipo === 'etapa' && valor) q = q.eq('kanban_status', valor)
  else if (tipo === 'origem' && valor) q = q.eq('origem', valor)
  const { count } = await q
  return count ?? 0
}

export async function POST(req: Request) {
  const { empresaId, userId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const nome = String(body.nome ?? '').trim()
  if (!nome) return NextResponse.json({ error: 'nome_obrigatorio' }, { status: 400 })
  const publicoTipo = String(body.publico_tipo ?? 'todos')
  const publicoValor = String(body.publico_valor ?? '').trim() || null
  const totalAlvos = await contarPublico(empresaId, publicoTipo, publicoValor)

  const db = rastrDb()
  const { data, error } = await db.from('tracker_disparo').insert({
    empresa_id: empresaId, criado_por: userId, nome,
    mensagem: String(body.mensagem ?? '').trim() || null,
    publico_tipo: publicoTipo, publico_valor: publicoValor,
    agendado_para: body.agendado_para ? new Date(String(body.agendado_para)).toISOString() : null,
    total_alvos: totalAlvos, status: 'rascunho',
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campanha: data })
}
