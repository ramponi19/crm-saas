import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { temVitrine } from '@/lib/modulos-vitrine'

/**
 * O dono pede um módulo pela vitrine (etapa 0, 2.5). Hoje só o superadmin liga
 * módulo; o pedido fica em `modulo_pedidos` e aparece na tela da empresa no
 * superadmin. Um pedido ABERTO por módulo: clicar de novo devolve o mesmo.
 *
 * A tabela não tem política de RLS — só a chave de serviço grava, depois de
 * conferir aqui que quem pede é dono ou admin da empresa da sessão.
 */
export async function POST(req: Request) {
  const ctx = await requireOwnerOrAdminApi()
  if (ctx.error) return ctx.error

  const { modulo } = await req.json().catch(() => ({})) as { modulo?: string }
  if (!modulo || !temVitrine(modulo)) return NextResponse.json({ error: 'Módulo desconhecido' }, { status: 400 })

  const svc = createServiceClient()
  const { data: aberto } = await svc.from('modulo_pedidos').select('pedido_em')
    .eq('empresa_id', ctx.empresaId).eq('modulo', modulo).is('atendido_em', null).maybeSingle()
  if (aberto) return NextResponse.json({ ok: true, pedido_em: aberto.pedido_em, ja_havia: true })

  const { data, error } = await svc.from('modulo_pedidos')
    .insert({ empresa_id: ctx.empresaId, modulo, pedido_por: ctx.userId })
    .select('pedido_em').single()
  if (error) return NextResponse.json({ error: 'Não foi possível registrar o pedido.' }, { status: 500 })
  return NextResponse.json({ ok: true, pedido_em: data.pedido_em })
}
