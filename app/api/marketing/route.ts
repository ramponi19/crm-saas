import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const STATUS = ['solicitado', 'em_analise', 'aprovado', 'divulgado']
const CANAIS = ['instagram', 'facebook', 'site', 'portais', 'whatsapp', 'email']

// Cria uma solicitação de marketing (qualquer usuário da empresa).
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { item?: string; objetivo?: string; canais?: string[] }
  const item = (b.item || '').trim()
  if (!item) return NextResponse.json({ error: 'Descreva o que divulgar' }, { status: 400 })
  const canais = (Array.isArray(b.canais) ? b.canais : []).filter((c) => CANAIS.includes(c))

  const { data, error } = await supabase.from('solicitacoes_marketing').insert({
    empresa_id: empresaId, item, objetivo: b.objetivo?.trim() || null, canais: canais as never,
    status: 'solicitado', solicitante_id: user.id,
  }).select('id, item, objetivo, canais, status, solicitante_id, created_at').single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })
  return NextResponse.json({ ok: true, solicitacao: data })
}

// Move de status (kanban).
export async function PATCH(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: number; status?: string }
  if (!b.id || !STATUS.includes(b.status || '')) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  const { error } = await supabase.from('solicitacoes_marketing').update({ status: b.status }).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })
  const { error } = await supabase.from('solicitacoes_marketing').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
