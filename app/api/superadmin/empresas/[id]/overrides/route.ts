import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import type { MenuOverrideRow } from '@/lib/menu'
import { createServiceClient } from '@/lib/supabase/service'
import { camadasDoMenu, gravarCamadaMenu, gravarModulosForcados } from '@/lib/empresa-config'
import { NextResponse } from 'next/server'

/**
 * Override do superadmin por empresa. Desde 21/10/2026 grava no core:
 *   menu_override    -> empresa_menu.itens.superadmin
 *   modulos_override -> empresa_modulos.config.forcado
 *
 * `habilitados` ausente no corpo PRESERVA o que existe. A tela de controle da
 * empresa manda só { hidden, labels }, e a coluna antiga era trocada inteira: a
 * liberação por empresa (ex.: a cotação de troca da JM) se perdia a cada save.
 */
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
  if ('limite_usuarios' in body) patch.limite_usuarios = Math.max(0, Math.floor(Number(body.limite_usuarios) || 0))
  if ('limite_leads' in body) patch.limite_leads = Math.max(0, Math.floor(Number(body.limite_leads) || 0))
  if (Object.keys(patch).length === 0 && !('menu_override' in body) && !('modulos_override' in body)) {
    return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })
  }

  const svc = createServiceClient()
  if (Object.keys(patch).length) {
    const { error } = await svc.from('empresas').update(patch as never).eq('id', empresaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if ('menu_override' in body) {
    let novo = body.menu_override ?? null
    if (novo && !('habilitados' in novo)) {
      const { data } = await svc.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle()
      const atual = camadasDoMenu((data as { itens?: unknown } | null)?.itens).superadmin
      if (atual?.habilitados) novo = { ...novo, habilitados: atual.habilitados }
    }
    const { error } = await gravarCamadaMenu(svc, empresaId, 'superadmin', novo)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if ('modulos_override' in body) {
    const { error } = await gravarModulosForcados(svc, empresaId, body.modulos_override ?? null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'editar_overrides_menu_modulos',
    detalhes: { ...patch, ...('menu_override' in body ? { menu_override: body.menu_override } : {}), ...('modulos_override' in body ? { modulos_override: body.modulos_override } : {}) },
  })
  return NextResponse.json({ ok: true })
}
