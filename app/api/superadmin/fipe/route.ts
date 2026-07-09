import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { atualizarReferencia } from '@/lib/fipe'
import { NextResponse } from 'next/server'

/** Força a atualização do mês de referência da FIPE (fallback manual do cron). */
export async function POST() {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error
  try {
    const { codigo, mes } = await atualizarReferencia()
    await logSuperAdminAction({ adminUserId: auth.userId, acao: 'atualizar_fipe', detalhes: { codigo, mes } })
    return NextResponse.json({ ok: true, codigo, mes })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao atualizar FIPE' }, { status: 502 })
  }
}
