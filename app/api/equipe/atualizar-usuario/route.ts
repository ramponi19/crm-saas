import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const { id, nome, role } = await req.json()
  if (!id || !nome || !role)
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: eu } = await supabase
    .from('empresa_usuarios')
    .select('role, empresa_id')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!eu || !['owner', 'admin'].includes(eu.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  // Confirm the target user belongs to the same company
  const { data: alvo } = await supabase
    .from('empresa_usuarios')
    .select('usuario_id')
    .eq('usuario_id', id)
    .eq('empresa_id', eu.empresa_id)
    .eq('ativo', true)
    .single()

  if (!alvo)
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  const { error } = await supabase.from('usuarios').update({ nome, role }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
