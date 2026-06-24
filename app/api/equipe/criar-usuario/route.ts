import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { verificarLimite } from '@/lib/limites'

// Papéis que podem ser atribuídos por esta rota. 'owner' é definido apenas
// na criação da empresa e não pode ser concedido aqui.
const ROLES_PERMITIDOS = ['admin', 'vendedor'] as const

export async function POST(req: NextRequest) {
  const { nome, email, senha, role } = await req.json()
  if (!nome || !email || !senha || !role)
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

  if (!ROLES_PERMITIDOS.includes(role))
    return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })

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

  // Enforcement de limite de usuários do plano
  const limite = await verificarLimite(eu.empresa_id, 'usuarios')
  if (!limite.permitido) {
    return NextResponse.json(
      { error: `Limite de usuários do plano atingido (${limite.usoAtual}/${limite.limite}). Faça upgrade para adicionar mais.` },
      { status: 402 }
    )
  }

  // Service client reservado exclusivamente para a criação do usuário no Auth,
  // operação administrativa que exige a service role. Todas as demais escritas
  // usam o client autenticado para que as políticas RLS continuem valendo.
  const service = createServiceClient()

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const userId = authData.user.id

  // O trigger on_auth_user_created (handle_new_user) já insere a linha em
  // public.usuarios com role 'vendedor' assim que o usuário é criado no Auth.
  // Portanto NÃO inserimos de novo (causaria duplicate key na pkey) — apenas
  // atualizamos nome e role para os valores desejados. Usamos o service client
  // para não depender de timing de RLS logo após a criação.
  const { error: uErr } = await service
    .from('usuarios')
    .update({ nome, email, role })
    .eq('id', userId)
  if (uErr) {
    // Desfaz o usuário recém-criado no Auth para não deixar órfãos.
    await service.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: uErr.message }, { status: 400 })
  }

  const { error: vErr } = await supabase.from('empresa_usuarios').insert({
    empresa_id: eu.empresa_id,
    usuario_id: userId,
    role,
    ativo: true,
  })
  if (vErr) {
    await service.from('usuarios').delete().eq('id', userId)
    await service.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: vErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id: userId })
}
