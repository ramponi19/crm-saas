import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import type { MenuOverrideRow } from '@/lib/menu'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    modulos_override?: Record<string, boolean> | null
    menu_override?: MenuOverrideRow | null
    limite_usuarios?: number
    limite_leads?: number
  }

  const patch: Record<string, unknown> = {}
  if ('modulos_override' in body) patch.modulos_override = body.modulos_override ?? null
  if ('menu_override' in body) patch.menu_override = body.menu_override ?? null
  if ('limite_usuarios' in body) patch.limite_usuarios = Math.max(0, Math.floor(Number(body.limite_usuarios) || 0))
  if ('limite_leads' in body) patch.limite_leads = Math.max(0, Math.floor(Number(body.limite_leads) || 0))
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })

  const svc = createServiceClient()
  const { error } = await svc.from('empresas').update(patch as never).eq('id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'editar_overrides_menu_modulos',
    detalhes: patch,
  })
  return NextResponse.json({ ok: true })
}
