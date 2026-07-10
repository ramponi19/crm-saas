import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface PassoIn { canal?: string; dia_offset?: number; titulo?: string; template_chave?: string | null }
interface CadenciaIn {
  id?: number
  nome?: string
  descricao?: string | null
  ativo?: boolean
  gatilho?: string
  gatilho_etapa_slug?: string | null
  passos?: PassoIn[]
}

async function exigirAdmin(supabase: Awaited<ReturnType<typeof createClient>>, empresaId: number, userId: string) {
  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', userId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', userId).single(),
  ])
  return usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
}

// Cria/atualiza uma cadência e seus passos (substitui os passos por completo). Admin.
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await exigirAdmin(supabase, empresaId, user.id))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as CadenciaIn
  const nome = (body.nome || '').trim()
  if (!nome) return NextResponse.json({ error: 'Informe o nome da cadência' }, { status: 400 })

  const dados = {
    empresa_id: empresaId,
    nome,
    descricao: body.descricao?.trim() || null,
    ativo: body.ativo !== false,
    gatilho: body.gatilho === 'entrou_etapa' ? 'entrou_etapa' : 'manual',
    gatilho_etapa_slug: body.gatilho === 'entrou_etapa' ? (body.gatilho_etapa_slug || null) : null,
  }

  let cadenciaId = body.id
  if (cadenciaId) {
    const { error } = await supabase.from('cadencias').update(dados).eq('id', cadenciaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data, error } = await supabase.from('cadencias').insert(dados).select('id').single()
    if (error || !data) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })
    cadenciaId = data.id
  }

  // Substitui os passos.
  await supabase.from('cadencia_passos').delete().eq('cadencia_id', cadenciaId)
  const passos = (body.passos ?? [])
    .map((p, i) => ({
      cadencia_id: cadenciaId!,
      empresa_id: empresaId,
      ordem: i + 1,
      canal: ['ligacao', 'whatsapp', 'email', 'tarefa'].includes(p.canal || '') ? p.canal! : 'ligacao',
      dia_offset: Math.max(0, Number(p.dia_offset) || 0),
      titulo: (p.titulo || '').trim() || 'Contatar o lead',
      template_chave: p.template_chave || null,
    }))
  if (passos.length) {
    const { error } = await supabase.from('cadencia_passos').insert(passos)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: cadenciaId })
}

// Exclui uma cadência (passos e inscrições caem por cascade). Admin.
export async function DELETE(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await exigirAdmin(supabase, empresaId, user.id))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })
  const { error } = await supabase.from('cadencias').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
