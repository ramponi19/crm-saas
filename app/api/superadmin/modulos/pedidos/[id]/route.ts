import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { moduloPorHref } from '@/core/modulos'
import { carregarConfigEmpresa, gravarModulosForcados, ligadosDaEmpresa } from '@/lib/empresa-config'
import { aoInstalarModulo, gravarModulo } from '@/lib/modulos-instalacao'
import { requisitosFaltando } from '@/lib/modulos-central'

/**
 * O SUPERADMIN ATENDE OU RECUSA UM PEDIDO DE MÓDULO (22/10/2026).
 *
 *   atender  instala o módulo na empresa do pedido (empresa_modulos, a mesma
 *            camada da Central) e fecha o pedido. Recurso de plano (Relatórios =
 *            `bi`) também ganha o forçado do superadmin, senão o item ficaria com
 *            cadeado. Módulo em preparação não se atende: não há tela para entregar.
 *            Desde 04/11/2026 instala junto os requisitos que faltam (`requer` do
 *            manifesto, transitivo) e fecha os pedidos deles; requisito em
 *            preparação bloqueia o atendimento, com o nome.
 *   recusar  marca o pedido como 'recusado' (recusado_em, recusado_por) e registra em
 *            superadmin_logs quem, quando, qual módulo e qual empresa. Até a primeira
 *            migração da viagem (23/10/2026) recusar APAGAVA o pedido — modulo_pedidos
 *            não tinha status; agora o histórico fica.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  const { id } = await params
  const { acao } = await req.json().catch(() => ({})) as { acao?: 'atender' | 'recusar' }
  if (acao !== 'atender' && acao !== 'recusar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })

  const svc = createServiceClient()
  const { data: pedido } = await svc.from('modulo_pedidos')
    .select('id, empresa_id, modulo, pedido_em, pedido_por, status').eq('id', Number(id)).maybeSingle()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.status !== 'pendente') return NextResponse.json({ error: `Pedido já ${pedido.status}` }, { status: 409 })

  const modulo = moduloPorHref(pedido.modulo)
  const detalhes = { pedido_id: pedido.id, modulo: pedido.modulo, pedido_em: pedido.pedido_em, pedido_por: pedido.pedido_por }

  if (acao === 'recusar') {
    const { error } = await svc.from('modulo_pedidos')
      .update({ status: 'recusado', recusado_em: new Date().toISOString(), recusado_por: ctx.userId }).eq('id', pedido.id)
    if (error) return NextResponse.json({ error: 'Não foi possível recusar.' }, { status: 500 })
    await logSuperAdminAction({ adminUserId: ctx.userId, empresaId: pedido.empresa_id, acao: 'recusar_pedido_modulo', detalhes })
    return NextResponse.json({ ok: true })
  }

  if (!modulo) return NextResponse.json({ error: 'Módulo fora do manifesto: só dá para recusar.' }, { status: 409 })
  if (modulo.emPreparacao) return NextResponse.json({ error: `${modulo.nome} está em preparação: só dá para recusar.` }, { status: 409 })

  const agora = new Date().toISOString()
  const cfg = await carregarConfigEmpresa(svc, pedido.empresa_id)
  const { data: empresa } = await svc.from('empresas').select('plano').eq('id', pedido.empresa_id).maybeSingle()
  const junto = requisitosFaltando(modulo, {
    ligados: ligadosDaEmpresa(cfg), plano: empresa?.plano ?? undefined, forcados: cfg.forcados,
    ativos: new Set(cfg.modulos.filter((r) => r.ativo).map((r) => r.modulo)),
  })
  const emPreparo = junto.find((r) => r.emPreparacao)
  if (emPreparo) return NextResponse.json({ error: `${modulo.nome} precisa de ${emPreparo.nome}, que está em preparação: só dá para recusar.` }, { status: 409 })

  // Requisitos primeiro, do mais fundo para o mais raso; o recurso de plano de cada
  // um (e do módulo) ganha o forçado, senão o item ficaria com cadeado.
  const ordem = [...junto, modulo]
  for (const m of ordem) {
    const { error } = await gravarModulo(svc, { empresaId: pedido.empresa_id, modulo: m, ativo: true, userId: ctx.userId, linhas: cfg.modulos })
    if (error) return NextResponse.json({ error: `Não foi possível instalar ${m.nome}.` }, { status: 500 })
  }
  const planos = ordem.map((m) => m.plano).filter((x): x is NonNullable<typeof x> => !!x && cfg.forcados?.[x] !== true)
  if (planos.length) {
    const r = await gravarModulosForcados(svc, pedido.empresa_id, { ...(cfg.forcados ?? {}), ...Object.fromEntries(planos.map((x) => [x, true])) })
    if (r.error) return NextResponse.json({ error: 'Instalou, mas não liberou o recurso do plano.' }, { status: 500 })
  }

  await svc.from('modulo_pedidos').update({ status: 'atendido', atendido_em: agora, atendido_por: ctx.userId }).eq('id', pedido.id)
  await logSuperAdminAction({ adminUserId: ctx.userId, empresaId: pedido.empresa_id, acao: 'atender_pedido_modulo', detalhes: { ...detalhes, junto: junto.map((m) => m.chave) } })
  const nomes = junto.map((m) => m.nome)
  for (const m of ordem) {
    const preparo = await aoInstalarModulo(svc, pedido.empresa_id, m.chave)
    if (preparo.error) {
      return NextResponse.json({ ok: true, junto: nomes, aviso: `${m.nome} foi instalado, mas não terminou de preparar. Reinstale pela Central da empresa.` })
    }
  }
  return NextResponse.json({ ok: true, junto: nomes })
}
