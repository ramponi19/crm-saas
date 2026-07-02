import { NextRequest, NextResponse } from 'next/server'
import { logSuperAdminAction, requireSuperAdminApi } from '@/lib/superadmin'
import { SEGMENTOS } from '@/lib/segmentos'
import type { Database } from '@/types/database'

type EmpresaUpdate = Database['public']['Tables']['empresas']['Update']

const PLANOS_VALIDOS = ['free', 'starter', 'pro'] as const
const STATUS_VALIDOS = ['ativo', 'suspenso', 'cancelado'] as const

type Acao =
  | { tipo: 'trocar_plano'; plano: string }
  | { tipo: 'alterar_status'; status: string }
  | { tipo: 'estender_trial'; dias: number }
  | { tipo: 'alterar_segmento'; segmento: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const { supabase } = ctx

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
    case 'alterar_segmento': {
      if (!(acao.segmento in SEGMENTOS)) {
        return NextResponse.json({ error: 'Segmento inválido' }, { status: 400 })
      }
      update = { segmento: acao.segmento }
      logAcao = 'alterar_segmento'
      logDetalhes = { segmento: acao.segmento }
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
    adminUserId: ctx.userId,
    empresaId,
    acao: logAcao,
    detalhes: logDetalhes,
  })

  return NextResponse.json({ ok: true })
}
