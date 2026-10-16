import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Roles que podem ser *atribuídos* via esta rota.
// 'owner' é imutável — só é definido na criação da empresa.
const ROLES_ATRIBUIVEIS = ['admin', 'vendedor', 'tecnico'] as const
type RoleAtribuivel = (typeof ROLES_ATRIBUIVEIS)[number]

// Hierarquia: um caller só pode atribuir roles abaixo do seu próprio.
const HIERARQUIA: Record<string, number> = { superadmin: 4, owner: 3, admin: 2, vendedor: 1, tecnico: 1 }

function podeAtribuir(callerRole: string, targetRole: string): boolean {
  return (HIERARQUIA[callerRole] ?? 0) > (HIERARQUIA[targetRole] ?? 0)
}

export async function PATCH(req: NextRequest) {
  const { id, nome, role, filialId } = await req.json() as
    { id?: string; nome?: string; role?: string; filialId?: number | null }
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

  let callerRole = 'superadmin'
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

  /**
   * Quem chama precisa estar ACIMA do papel atual do alvo, nao so do papel novo.
   * Antes so o papel novo era conferido: um admin rebaixava outro admin a
   * vendedor, e um dono rebaixava outro dono (ou a si mesmo) e a empresa podia
   * ficar sem dono. Dono so muda por transferencia de propriedade, fora daqui.
   */
  if ((HIERARQUIA[callerRole] ?? 0) <= (HIERARQUIA[alvo.role] ?? 0))
    return NextResponse.json({ error: 'Sem permissão para alterar este usuário' }, { status: 403 })

  // Superadmin pode mexer num dono, mas nunca deixar a empresa sem nenhum.
  if (alvo.role === 'owner') {
    const { count } = await createServiceClient()
      .from('empresa_usuarios').select('usuario_id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('role', 'owner').eq('ativo', true).neq('usuario_id', id)
    if (!count)
      return NextResponse.json({ error: 'A empresa ficaria sem dono' }, { status: 409 })
  }

  // Usa service client para garantir a escrita mesmo com RLS
  const service = createServiceClient()

  /**
   * A loja da pessoa entra no MESMO update do papel.
   *
   * `filialId` ausente no corpo significa "a tela nao tem esse campo" (o CRM nao
   * tem) e a loja fica como esta. `null` explicito significa "sem loja definida",
   * que e uma escolha valida: a pessoa cai na loja principal.
   */
  const patch: { role: string; filial_id?: number | null } = { role: role as string }
  if (filialId !== undefined) {
    if (filialId === null) {
      patch.filial_id = null
    } else {
      const { data: filial } = await service
        .from('filiais')
        .select('id')
        .eq('id', filialId)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .maybeSingle()
      if (!filial) return NextResponse.json({ error: 'Loja não encontrada nesta empresa' }, { status: 400 })
      patch.filial_id = filialId
    }
  }

  // O nome so e gravado depois de tudo validado: antes, uma loja invalida
  // devolvia 400 com o nome ja trocado.
  const { error: uErr } = await service
    .from('usuarios')
    .update({ nome })
    .eq('id', id)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

  const { error: euErr } = await service
    .from('empresa_usuarios')
    .update(patch)
    .eq('usuario_id', id)
    .eq('empresa_id', empresaId)
  if (euErr) return NextResponse.json({ error: euErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
