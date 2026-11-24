import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * CONTA DE SERVIÇO E "PARTICIPA DA ROLETA" (24/11/2026; migração 20261124001000). Universal.
 *
 * - `contaServico`: a conta não é uma pessoa (revisão da Meta, integração). Sai de todas as roletas (vendas e
 *   pós-venda) e não conta como "vendedor do negócio" no pós-venda. Continua ativa.
 * - `participaRoleta`: uma pessoa fora da distribuição automática; continua dona dos próprios clientes.
 *
 * Quem muda: o dono (e o superadmin) muda qualquer pessoa da empresa, inclusive a si mesmo; o administrador
 * muda quem não é dono. Separado de /api/equipe/atualizar-usuario porque lá só se mexe em quem está ABAIXO
 * (o dono não conseguiria tirar a si mesmo da roleta).
 */
export async function PATCH(req: NextRequest) {
  const corpo = await req.json().catch(() => null) as { id?: string; contaServico?: unknown; participaRoleta?: unknown } | null
  const id = corpo?.id
  const patch: { conta_servico?: boolean; participa_roleta?: boolean } = {}
  if (typeof corpo?.contaServico === 'boolean') patch.conta_servico = corpo.contaServico
  if (typeof corpo?.participaRoleta === 'boolean') patch.participa_roleta = corpo.participaRoleta
  if (!id || !Object.keys(patch).length) return NextResponse.json({ error: 'Informe o usuário e o que muda' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })

  const service = createServiceClient()
  const { data: eu } = await supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle()
  let callerRole = 'superadmin'
  if (!eu?.is_super_admin) {
    const { data: vinc } = await service.from('empresa_usuarios').select('role')
      .eq('empresa_id', empresaId).eq('usuario_id', user.id).eq('ativo', true).maybeSingle()
    if (!vinc || !['owner', 'admin'].includes(vinc.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    callerRole = vinc.role
  }

  const { data: alvo } = await service.from('empresa_usuarios').select('role')
    .eq('empresa_id', empresaId).eq('usuario_id', id).eq('ativo', true).maybeSingle()
  if (!alvo) return NextResponse.json({ error: 'Usuário não encontrado nesta empresa' }, { status: 404 })
  if (callerRole === 'admin' && alvo.role === 'owner') {
    return NextResponse.json({ error: 'Só o dono muda a distribuição do dono' }, { status: 403 })
  }

  const { data: gravado, error } = await service.from('empresa_usuarios').update(patch)
    .eq('empresa_id', empresaId).eq('usuario_id', id).select('usuario_id, conta_servico, participa_roleta')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!gravado?.length) return NextResponse.json({ error: 'Nada gravado' }, { status: 409 })
  return NextResponse.json({ ok: true, ...gravado[0] })
}
