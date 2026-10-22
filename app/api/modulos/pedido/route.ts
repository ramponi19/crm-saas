import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { moduloPorChave } from '@/core/modulos'
import { carregarConfigEmpresa } from '@/lib/empresa-config'
import { estadoDoModulo } from '@/lib/modulos-central'

/**
 * O dono pede um módulo PAGO pela Central (22/10/2026; na etapa 0 o pedido saía
 * da vitrine). Pago = fora do plano da empresa ou contratado à parte: o dono não
 * instala sozinho, o superadmin atende (/superadmin/pedidos). Um pedido ABERTO por
 * módulo: clicar de novo devolve o mesmo.
 *
 * `modulo_pedidos.modulo` guarda o endereço do módulo (`/zapintel`, `/relatorios`),
 * como desde a etapa 0. A tabela não tem política de RLS — só a chave de serviço
 * grava, depois de conferir aqui que quem pede é dono ou admin da empresa.
 */
export async function POST(req: Request) {
  const ctx = await requireOwnerOrAdminApi()
  if (ctx.error) return ctx.error

  const { chave } = await req.json().catch(() => ({})) as { chave?: string }
  const modulo = chave ? moduloPorChave(chave) : undefined
  if (!modulo) return NextResponse.json({ error: 'Módulo desconhecido' }, { status: 400 })

  const svc = createServiceClient()
  const { data: empresa } = await svc.from('empresas').select('plano, preset_onboarding').eq('id', ctx.empresaId).maybeSingle()
  const cfg = await carregarConfigEmpresa(svc, ctx.empresaId, empresa?.preset_onboarding ?? null)
  // O estado do pago não depende do menu ligado: plano, forçados e o que está ativo bastam.
  const estado = estadoDoModulo(modulo, {
    ligados: new Set(), plano: empresa?.plano ?? undefined, forcados: cfg.forcados,
    ativos: new Set(cfg.modulos.filter((r) => r.ativo).map((r) => r.modulo)),
  })
  if (estado.tipo !== 'pago') return NextResponse.json({ error: `${modulo.nome} não precisa de pedido.` }, { status: 409 })

  const { data: aberto } = await svc.from('modulo_pedidos').select('pedido_em')
    .eq('empresa_id', ctx.empresaId).eq('modulo', modulo.href).is('atendido_em', null).maybeSingle()
  if (aberto) return NextResponse.json({ ok: true, pedido_em: aberto.pedido_em, ja_havia: true })

  const { data, error } = await svc.from('modulo_pedidos')
    .insert({ empresa_id: ctx.empresaId, modulo: modulo.href, pedido_por: ctx.userId })
    .select('pedido_em').single()
  if (error) return NextResponse.json({ error: 'Não foi possível registrar o pedido.' }, { status: 500 })
  return NextResponse.json({ ok: true, pedido_em: data.pedido_em })
}
