import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface RegraIn {
  id?: number
  nome?: string
  ativo?: boolean
  criterio?: string
  config?: Record<string, unknown>
  destinatarios?: string[]
  ordem?: number
}

async function exigirAdmin(supabase: Awaited<ReturnType<typeof createClient>>, empresaId: number, userId: string) {
  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', userId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', userId).single(),
  ])
  return usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await exigirAdmin(supabase, empresaId, user.id))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as RegraIn & { ordens?: { id: number; ordem: number }[] }

  // Reordenação em lote.
  if (body.ordens) {
    for (const o of body.ordens) {
      await supabase.from('distribuicao_regras').update({ ordem: o.ordem }).eq('id', o.id)
    }
    return NextResponse.json({ ok: true })
  }

  const nome = (body.nome || '').trim()
  if (!nome) return NextResponse.json({ error: 'Informe o nome da regra' }, { status: 400 })
  const criterio = ['qualquer', 'origem', 'faixa_valor'].includes(body.criterio || '') ? body.criterio! : 'qualquer'

  const dados = {
    empresa_id: empresaId,
    nome,
    ativo: body.ativo !== false,
    criterio,
    config: (body.config ?? {}) as never,
    destinatarios: (Array.isArray(body.destinatarios) ? body.destinatarios : []) as never,
  }

  if (body.id) {
    const { error } = await supabase.from('distribuicao_regras').update(dados).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: body.id })
  }

  const { data: max } = await supabase.from('distribuicao_regras').select('ordem').eq('empresa_id', empresaId).order('ordem', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from('distribuicao_regras').insert({ ...dados, ordem: (max?.ordem ?? 0) + 1 }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await exigirAdmin(supabase, empresaId, user.id))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })
  const { error } = await supabase.from('distribuicao_regras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
