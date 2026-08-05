import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Contatos do Tracker (leads). GET lista (com ?arquivados=1); POST cria contato.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { empresaId } = await trackerEmpresa()
  const arquivados = new URL(req.url).searchParams.get('arquivados') === '1'
  const db = rastrDb()

  const { data } = await db.from('leads')
    .select('id, nome, telefone, foto_url, origem, kanban_status, valor_estimado, produto_interessado, created_at')
    .eq('empresa_id', empresaId).eq('ativo', !arquivados)
    .order('created_at', { ascending: false }).limit(1000)

  return NextResponse.json({ contatos: data ?? [] })
}

export async function POST(req: Request) {
  const { empresaId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const nome = String(body.nome ?? '').trim()
  const telefone = String(body.telefone ?? '').replace(/\D/g, '') || null
  if (!nome && !telefone) return NextResponse.json({ error: 'nome_ou_telefone' }, { status: 400 })

  const db = rastrDb()
  const { data, error } = await db.from('leads').insert({
    empresa_id: empresaId, nome: nome || telefone, telefone,
    origem: 'manual', kanban_status: 'novo', ativo: true,
  }).select('id, nome, telefone, foto_url, origem, kanban_status, valor_estimado, produto_interessado, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contato: data })
}
