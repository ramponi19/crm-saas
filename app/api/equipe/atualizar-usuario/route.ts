import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Roles que podem ser *atribuídos* via esta rota.
// 'owner' é imutável — só é definido na criação da empresa.
const ROLES_ATRIBUIVEIS = ['admin', 'vendedor', 'tecnico'] as const
type RoleAtribuivel = (typeof ROLES_ATRIBUIVEIS)[number]

// Hierarquia: um caller só pode atribuir roles abaixo do seu próprio.
const HIERARQUIA: Record<string, number> = { owner: 3, admin: 2, vendedor: 1, tecnico: 1 }

function podeAtribuir(callerRole: string, targetRole: string): boolean {
  return (HIERARQUIA[callerRole] ?? 0) > (HIERARQUIA[targetRole] ?? 0)
}

export async function PATCH(req: NextRequest) {
  const { id, nome, role } = await req.json()
  if (!id || !nome || !role)
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

  if (!ROLES_ATRIBUIVEIS.includes(role as RoleAtribuivel))
    return NextResponse.json({ error: 'Papel inválido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()

  const { data: usuarioAtual } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  let callerRole = 'owner' // super_admin tem permissão total
  if (!usuarioAtual?.is_super_admin) {
    const { data: eu } = await supabase
      .from('empresa_usuarios')
      .select('role')
      .eq('usuario_id', user.id)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .single()

    if (!eu || !['owner', 'admin'].includes(eu.role))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    callerRole = eu.role
  }

  // Verifica se o caller tem hierarquia suficiente para atribuir o role alvo
  if (!podeAtribuir(callerRole, role))
    return NextResponse.json({ error: 'Sem permissão para atribuir este papel' }, { status: 403 })

  // Confirma que o alvo pertence à mesma empresa e está ativo
  const { data: alvo } = await supabase
    .from('empresa_usuarios')
    .select('usuario_id, role')
    .eq('usuario_id', id)
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .single()

  if (!alvo)
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  // Impede rebaixar outro owner (só o próprio owner pode transferir ownership)
  if (alvo.role === 'owner' && callerRole !== 'owner')
    return NextResponse.json({ error: 'Sem permissão para alterar um owner' }, { status: 403 })

  // Usa service client para garantir a escrita mesmo com RLS
  const service = createServiceClient()

  const { error: uErr } = await service
    .from('usuarios')
    .update({ nome })
    .eq('id', id)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

  const { error: euErr } = await service
    .from('empresa_usuarios')
    .update({ role })
    .eq('usuario_id', id)
    .eq('empresa_id', empresaId)
  if (euErr) return NextResponse.json({ error: euErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
