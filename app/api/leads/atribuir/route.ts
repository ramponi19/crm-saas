import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

/**
 * Posse/roteamento de leads (Fase 4.7).
 * - pegar: vendedor assume um lead da esteira (sem dono) → vira dele.
 * - devolver: dono do lead OU admin devolve para a esteira (sem dono).
 * - transferir/atribuir: admin/owner define outro responsável.
 */
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { leadId?: number; acao?: string; paraResponsavel?: string | null }
  if (!body.leadId || !body.acao) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })

  const { data: vinculo } = await supabase
    .from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle()
  const role = vinculo?.role ?? ''
  const isAdmin = role === 'owner' || role === 'admin'

  const { data: lead } = await supabase.from('leads').select('responsavel_id').eq('id', body.leadId).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  const atual = (lead as { responsavel_id: string | null }).responsavel_id

  let novo: string | null
  switch (body.acao) {
    case 'pegar':
      if (atual && atual !== user.id && !isAdmin) return NextResponse.json({ error: 'Este lead já tem um responsável.' }, { status: 409 })
      novo = user.id
      break
    case 'devolver':
      if (!isAdmin && atual !== user.id) return NextResponse.json({ error: 'Só o responsável ou um admin pode devolver.' }, { status: 403 })
      novo = null
      break
    case 'transferir':
    case 'atribuir':
      if (!isAdmin) return NextResponse.json({ error: 'Apenas admin/proprietário pode transferir.' }, { status: 403 })
      novo = body.paraResponsavel || null
      break
    default:
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  // A troca e o registro numa transação só (negocio_atribuir): o responsável muda,
  // `responsavel_desde` marca o início do prazo de devolução à esteira (soltar
  // limpa o marco), e o negocio_historico grava a AÇÃO (pegar, devolver...) e quem
  // pediu. Até 21/10/2026 o detalhe ia para lead_atribuicoes, à parte, e o erro
  // daquele insert não era conferido. O lead já foi lido acima pela sessão do
  // usuário (RLS); a função roda pelo servidor, que já conferiu o papel.
  const { error } = await createServiceClient().rpc('negocio_atribuir' as never, {
    p_negocio: body.leadId, p_responsavel: novo, p_acao: body.acao, p_por: user.id,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, responsavel_id: novo })
}
