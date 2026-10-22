import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { moduloPorHref } from '@/core/modulos'
import { carregarConfigEmpresa, gravarModulosForcados } from '@/lib/empresa-config'

/**
 * O SUPERADMIN ATENDE OU RECUSA UM PEDIDO DE MÓDULO (22/10/2026).
 *
 *   atender  instala o módulo na empresa do pedido (empresa_modulos, a mesma
 *            camada da Central) e fecha o pedido. Recurso de plano (Relatórios =
 *            `bi`) também ganha o forçado do superadmin, senão o item ficaria com
 *            cadeado. Módulo em preparação não se atende: não há tela para entregar.
 *   recusar  APAGA o pedido e registra em superadmin_logs quem, quando, qual módulo
 *            e qual empresa (decisão do Lucas, 22/10/2026: modulo_pedidos não tem
 *            coluna de status e hoje não há migração; na primeira migração da
 *            viagem ganha `status` e recusar deixa de apagar — ver o 05).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  const { id } = await params
  const { acao } = await req.json().catch(() => ({})) as { acao?: 'atender' | 'recusar' }
  if (acao !== 'atender' && acao !== 'recusar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })

  const svc = createServiceClient()
  const { data: pedido } = await svc.from('modulo_pedidos')
    .select('id, empresa_id, modulo, pedido_em, pedido_por, atendido_em').eq('id', Number(id)).maybeSingle()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.atendido_em) return NextResponse.json({ error: 'Pedido já atendido' }, { status: 409 })

  const modulo = moduloPorHref(pedido.modulo)
  const detalhes = { pedido_id: pedido.id, modulo: pedido.modulo, pedido_em: pedido.pedido_em, pedido_por: pedido.pedido_por }

  if (acao === 'recusar') {
    const { error } = await svc.from('modulo_pedidos').delete().eq('id', pedido.id)
    if (error) return NextResponse.json({ error: 'Não foi possível recusar.' }, { status: 500 })
    await logSuperAdminAction({ adminUserId: ctx.userId, empresaId: pedido.empresa_id, acao: 'recusar_pedido_modulo', detalhes })
    return NextResponse.json({ ok: true })
  }

  if (!modulo) return NextResponse.json({ error: 'Módulo fora do manifesto: só dá para recusar.' }, { status: 409 })
  if (modulo.emPreparacao) return NextResponse.json({ error: `${modulo.nome} está em preparação: só dá para recusar.` }, { status: 409 })

  const agora = new Date().toISOString()
  const cfg = await carregarConfigEmpresa(svc, pedido.empresa_id, null)
  const atual = cfg.modulos.find((r) => r.modulo === modulo.chave)
  const { error } = atual
    ? await svc.from('empresa_modulos').update({ ativo: true, instalado_em: agora, instalado_por: ctx.userId, updated_at: agora })
        .eq('empresa_id', pedido.empresa_id).eq('modulo', modulo.chave)
    : await svc.from('empresa_modulos').insert({
        empresa_id: pedido.empresa_id, modulo: modulo.chave, origem: modulo.addon ? 'addon' : 'plano',
        ativo: true, instalado_em: agora, instalado_por: ctx.userId,
      })
  if (error) return NextResponse.json({ error: 'Não foi possível instalar.' }, { status: 500 })

  if (modulo.plano && cfg.forcados?.[modulo.plano] !== true) {
    const r = await gravarModulosForcados(svc, pedido.empresa_id, { ...(cfg.forcados ?? {}), [modulo.plano]: true })
    if (r.error) return NextResponse.json({ error: 'Instalou, mas não liberou o recurso do plano.' }, { status: 500 })
  }

  await svc.from('modulo_pedidos').update({ atendido_em: agora, atendido_por: ctx.userId }).eq('id', pedido.id)
  await logSuperAdminAction({ adminUserId: ctx.userId, empresaId: pedido.empresa_id, acao: 'atender_pedido_modulo', detalhes })
  return NextResponse.json({ ok: true })
}
