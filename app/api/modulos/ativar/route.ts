import { NextResponse } from 'next/server'
import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { camadasDoMenu, gravarCamadaMenu } from '@/lib/empresa-config'
import { temVitrine } from '@/lib/modulos-vitrine'

/**
 * O superadmin liga um módulo pela vitrine, na empresa em que está (a
 * impersonada). Grava na camada do superadmin (`empresa_menu.itens.superadmin`):
 * acrescenta o href a `habilitados` e o tira de `hidden` — o mesmo lugar que a
 * tela de controle da empresa usa. Fecha os pedidos abertos do módulo.
 *
 * A trava do proxy guarda os habilitados por um minuto: a tela pode levar esse
 * tempo para abrir, e a vitrine avisa.
 */
export async function POST(req: Request) {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  const { modulo } = await req.json().catch(() => ({})) as { modulo?: string }
  if (!modulo || !temVitrine(modulo)) return NextResponse.json({ error: 'Módulo desconhecido' }, { status: 400 })

  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Entre numa empresa antes de ativar.' }, { status: 400 })

  const svc = createServiceClient()
  const { data } = await svc.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle()
  const atual = camadasDoMenu((data as { itens?: unknown } | null)?.itens).superadmin ?? {}
  const novo = {
    ...atual,
    habilitados: [...new Set([...(atual.habilitados ?? []), modulo])],
    hidden: (atual.hidden ?? []).filter((h) => h !== modulo),
  }
  const { error } = await gravarCamadaMenu(svc, empresaId, 'superadmin', novo)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await svc.from('modulo_pedidos')
    .update({ atendido_em: new Date().toISOString(), atendido_por: ctx.userId })
    .eq('empresa_id', empresaId).eq('modulo', modulo).is('atendido_em', null)

  await logSuperAdminAction({ adminUserId: ctx.userId, empresaId, acao: 'ativar_modulo', detalhes: { modulo } })
  return NextResponse.json({ ok: true })
}
