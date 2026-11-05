import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { moduloPorChave } from '@/core/modulos'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { estadoDoModulo, requisitosFaltando, type EntradaCentral } from '@/lib/modulos-central'

/**
 * O dono pede um módulo PAGO pela Central (22/10/2026; na etapa 0 o pedido saía
 * da vitrine). Pago = fora do plano da empresa ou contratado à parte: o dono não
 * instala sozinho, o superadmin atende (/superadmin/pedidos). Um pedido ABERTO por
 * módulo: clicar de novo devolve o mesmo.
 *
 * `modulo_pedidos.modulo` guarda o endereço do módulo (`/zapintel`, `/relatorios`),
 * como desde a etapa 0. A tabela não tem política de RLS — só a chave de serviço
 * grava, depois de conferir aqui que quem pede é dono ou admin da empresa.
 *
 * DEPENDÊNCIAS (04/11/2026): o pedido leva junto os requisitos que a empresa ainda
 * não tem ligados — um pedido aberto para cada, para o superadmin ver o pacote
 * inteiro; atender o principal instala os requisitos e fecha esses pedidos.
 */
export async function POST(req: Request) {
  const ctx = await requireOwnerOrAdminApi()
  if (ctx.error) return ctx.error

  const { chave } = await req.json().catch(() => ({})) as { chave?: string }
  const modulo = chave ? moduloPorChave(chave) : undefined
  if (!modulo) return NextResponse.json({ error: 'Módulo desconhecido' }, { status: 400 })

  const svc = createServiceClient()
  const { data: empresa } = await svc.from('empresas').select('plano').eq('id', ctx.empresaId).maybeSingle()
  const cfg = await carregarConfigEmpresa(svc, ctx.empresaId)
  const entrada: EntradaCentral = {
    ligados: ligadosDaEmpresa(cfg), plano: empresa?.plano ?? undefined, forcados: cfg.forcados,
    ativos: new Set(cfg.modulos.filter((r) => r.ativo).map((r) => r.modulo)),
  }
  const estado = estadoDoModulo(modulo, entrada)
  if (estado.tipo !== 'pago') return NextResponse.json({ error: `${modulo.nome} não precisa de pedido.` }, { status: 409 })

  // Os requisitos que faltam entram no pedido (um pedido aberto por módulo).
  const junto = requisitosFaltando(modulo, entrada)
  const hrefs = [...junto.map((m) => m.href), modulo.href]
  const { data: abertos } = await svc.from('modulo_pedidos').select('modulo, pedido_em')
    .eq('empresa_id', ctx.empresaId).in('modulo', hrefs).eq('status', 'pendente')
  const jaAberto = new Map((abertos ?? []).map((a) => [a.modulo, a.pedido_em as string]))
  const novos = hrefs.filter((h) => !jaAberto.has(h))
  const nomes = junto.map((m) => m.nome)
  if (novos.length === 0) return NextResponse.json({ ok: true, pedido_em: jaAberto.get(modulo.href), ja_havia: true, junto: nomes })

  const { data, error } = await svc.from('modulo_pedidos')
    .insert(novos.map((h) => ({ empresa_id: ctx.empresaId, modulo: h, pedido_por: ctx.userId })))
    .select('modulo, pedido_em')
  if (error || !data?.length) return NextResponse.json({ error: 'Não foi possível registrar o pedido.' }, { status: 500 })
  const doPrincipal = data.find((d) => d.modulo === modulo.href)?.pedido_em ?? jaAberto.get(modulo.href)
  return NextResponse.json({ ok: true, pedido_em: doPrincipal, junto: nomes })
}
