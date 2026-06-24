import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logSuperAdminAction } from '@/lib/superadmin'
import type { Database } from '@/types/database'

type EmpresaUpdate = Database['public']['Tables']['empresas']['Update']

const PLANOS_VALIDOS = ['free', 'starter', 'pro'] as const
const STATUS_VALIDOS = ['ativo', 'suspenso', 'cancelado'] as const

type Acao =
  | { tipo: 'trocar_plano'; plano: string }
  | { tipo: 'alterar_status'; status: string }
  | { tipo: 'estender_trial'; dias: number }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Verificação de super admin (RLS também protege, mas validamos aqui antes de agir)
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (!usuario?.is_super_admin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const acao = (await req.json()) as Acao

  let update: EmpresaUpdate = {}
  let logAcao = ''
  let logDetalhes: Record<string, unknown> = {}

  switch (acao.tipo) {
    case 'trocar_plano': {
      if (!PLANOS_VALIDOS.includes(acao.plano as typeof PLANOS_VALIDOS[number])) {
        return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
      }
      update = { plano: acao.plano }
      logAcao = 'trocar_plano'
      logDetalhes = { plano: acao.plano }
      break
    }
    case 'alterar_status': {
      if (!STATUS_VALIDOS.includes(acao.status as typeof STATUS_VALIDOS[number])) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
      }
      update = { status: acao.status }
      logAcao = 'alterar_status'
      logDetalhes = { status: acao.status }
      break
    }
    case 'estender_trial': {
      const dias = Number(acao.dias)
      if (!Number.isFinite(dias) || dias <= 0 || dias > 365) {
        return NextResponse.json({ error: 'Quantidade de dias inválida' }, { status: 400 })
      }
      const novoFim = new Date()
      novoFim.setDate(novoFim.getDate() + dias)
      update = { trial_ends_at: novoFim.toISOString() }
      logAcao = 'estender_trial'
      logDetalhes = { dias, trial_ends_at: novoFim.toISOString() }
      break
    }
    default:
      return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
  }

  const { error } = await supabase
    .from('empresas')
    .update(update)
    .eq('id', empresaId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logSuperAdminAction({
    adminUserId: user.id,
    empresaId,
    acao: logAcao,
    detalhes: logDetalhes,
  })

  return NextResponse.json({ ok: true })
}
