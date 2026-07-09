import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Json } from '@/types/database'

interface Item { descricao: string; qtd: number; valor: number }

function normalizar(itensRaw: unknown): { itens: Item[]; total: number } {
  const arr = Array.isArray(itensRaw) ? itensRaw : []
  const itens: Item[] = arr.map((r) => {
    const o = r as Record<string, unknown>
    return { descricao: String(o.descricao ?? '').slice(0, 200), qtd: Math.max(0, Number(o.qtd) || 0), valor: Math.max(0, Number(o.valor) || 0) }
  }).filter(i => i.descricao)
  const total = itens.reduce((s, i) => s + i.qtd * i.valor, 0)
  return { itens, total }
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const body = await req.json().catch(() => ({})) as { cliente_nome?: string; lead_id?: number | null; itens?: unknown; observacoes?: string }
  const { itens, total } = normalizar(body.itens)
  const { data, error } = await supabase.from('propostas').insert({
    empresa_id: empresaId,
    cliente_nome: (body.cliente_nome ?? '').trim(),
    lead_id: body.lead_id ?? null,
    itens: itens as unknown as Json,
    observacoes: body.observacoes?.trim() || null,
    total,
    status: 'rascunho',
  }).select('id, token').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id, token: data?.token })
}

export async function PATCH(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const body = await req.json().catch(() => ({})) as { id?: number; cliente_nome?: string; itens?: unknown; observacoes?: string; status?: string }
  if (!body.id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.cliente_nome === 'string') patch.cliente_nome = body.cliente_nome.trim()
  if (typeof body.observacoes === 'string') patch.observacoes = body.observacoes.trim() || null
  if ('itens' in body) { const { itens, total } = normalizar(body.itens); patch.itens = itens; patch.total = total }
  if (body.status && ['rascunho', 'enviada', 'aceita', 'recusada'].includes(body.status)) patch.status = body.status
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })

  const { error } = await supabase.from('propostas').update(patch as never).eq('id', body.id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const body = await req.json().catch(() => ({})) as { id?: number }
  if (!body.id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { error } = await supabase.from('propostas').delete().eq('id', body.id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
