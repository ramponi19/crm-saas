import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Remove um membro da equipe: DESATIVA o vínculo com a empresa
 * (`empresa_usuarios.ativo = false`).
 *
 * Não apaga o usuário, de propósito. As vendas apontam para ele por
 * `vendas.vendedor_id` — apagar levaria o histórico embora ou deixaria venda sem
 * dono, e "quem vendeu" é dado que a loja precisa manter (comissão, ranking,
 * relatório). Desativar tira o acesso, que é o que se quer ao desligar alguém:
 * todo o isolamento por empresa passa por `get_empresa_id()`, que exige vínculo
 * ATIVO. Sem ele, a pessoa não alcança mais nenhum dado da loja.
 */

const HIERARQUIA: Record<string, number> = { owner: 3, admin: 2, vendedor: 1, tecnico: 1 }

export async function POST(req: NextRequest) {
  let body: { id?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }
  const alvoId = typeof body.id === 'string' ? body.id : ''
  if (!alvoId) return NextResponse.json({ error: 'Usuário inválido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  // Ninguém se remove: quem faz isso perde o acesso na hora e não tem como
  // desfazer sozinho.
  if (alvoId === user.id) {
    return NextResponse.json({ error: 'Você não pode remover a si mesmo da equipe.' }, { status: 400 })
  }

  const { data: usuarioAtual } = await supabase
    .from('usuarios').select('is_super_admin').eq('id', user.id).single()

  let callerRole = 'owner' // super admin tem permissão total
  if (!usuarioAtual?.is_super_admin) {
    const { data: eu } = await supabase
      .from('empresa_usuarios').select('role')
      .eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).single()
    if (!eu || !['owner', 'admin'].includes(eu.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }
    callerRole = eu.role
  }

  const { data: alvo } = await supabase
    .from('empresa_usuarios').select('role')
    .eq('usuario_id', alvoId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle()
  if (!alvo) return NextResponse.json({ error: 'Este usuário não está na equipe' }, { status: 404 })

  // O proprietário não é removível: ele é o dono da conta. Trocar de dono é
  // outra operação, com outras consequências (assinatura, cobrança).
  if (alvo.role === 'owner') {
    return NextResponse.json({ error: 'O proprietário não pode ser removido da equipe.' }, { status: 400 })
  }

  // Admin não remove admin: só quem está acima na hierarquia.
  if ((HIERARQUIA[callerRole] ?? 0) <= (HIERARQUIA[alvo.role] ?? 0)) {
    return NextResponse.json({
      error: `Você não tem permissão para remover um ${alvo.role}.`,
    }, { status: 403 })
  }

  // Service client para não depender de a policy de UPDATE cobrir a linha de
  // outro usuário; o filtro por empresa_id + usuario_id mantém o escopo.
  const service = createServiceClient()
  const { error } = await service
    .from('empresa_usuarios')
    .update({ ativo: false })
    .eq('usuario_id', alvoId)
    .eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Solta as reservas de estoque que estavam no nome dele — senão ficariam
  // presas para sempre, com a unidade fora do PDV.
  await service
    .from('inventario_unidades')
    .update({ status: 'disponivel', reservado_lead_id: null, reservado_por: null, reservado_em: null, reserva_expira_em: null })
    .eq('empresa_id', empresaId)
    .eq('reservado_por', alvoId)
    .eq('status', 'reservado')

  return NextResponse.json({ ok: true })
}
