import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { nome, email, senha, role } = await req.json()
  if (!nome || !email || !senha || !role)
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: eu } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id, role')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!eu || !['owner', 'admin'].includes(eu.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const service = createServiceClient()

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const userId = authData.user.id

  const { error: uErr } = await service.from('usuarios').insert({ id: userId, nome, email, role })
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

  await service.from('empresa_usuarios').insert({
    empresa_id: eu.empresa_id,
    usuario_id: userId,
    role,
    ativo: true,
  })

  return NextResponse.json({ ok: true, id: userId })
}
