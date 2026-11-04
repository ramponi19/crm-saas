import { createServiceClient } from '@/lib/supabase/service'
import { Card } from '@/components/ui'
import { moduloPorHref } from '@/core/modulos'
import { PedidosModulo, PedidosRecusados, type PedidoModulo, type PedidoRecusado } from '@/components/superadmin/pedidos-modulo'

export const metadata = { title: 'Pedidos de módulo' }

/**
 * Pedidos de módulo de todas as empresas (22/10/2026): o dono pede pela Central
 * de Módulos o que é pago (fora do plano ou contratado à parte); aqui se atende
 * (instala) ou recusa. Desde a viagem 1 (03/11/2026) recusar não apaga: o pedido
 * fica `recusado`, com data e quem recusou, e aparece no histórico abaixo dos
 * abertos (04/11/2026). Rota trancada no superadmin/layout.
 */
const RECUSADOS_NA_TELA = 50

export default async function PedidosModuloPage() {
  const svc = createServiceClient()
  const [{ data }, { data: recusadosRaw }] = await Promise.all([
    svc.from('modulo_pedidos')
      .select('id, modulo, pedido_em, empresa:empresas(id, nome), usuario:usuarios!modulo_pedidos_pedido_por_fkey(nome)')
      .eq('status', 'pendente').order('pedido_em'),
    svc.from('modulo_pedidos')
      .select('id, modulo, pedido_em, recusado_em, empresa:empresas(id, nome), usuario:usuarios!modulo_pedidos_pedido_por_fkey(nome), recusou:usuarios!modulo_pedidos_recusado_por_fkey(nome)')
      .eq('status', 'recusado').order('recusado_em', { ascending: false }).limit(RECUSADOS_NA_TELA),
  ])

  const linhas = (data ?? []) as unknown as Array<{
    id: number; modulo: string; pedido_em: string
    empresa: { id: number; nome: string } | null; usuario: { nome: string | null } | null
  }>
  const pedidos: PedidoModulo[] = linhas.map((p) => {
    const m = moduloPorHref(p.modulo)
    return {
      id: p.id, modulo: p.modulo, nome: m?.nome ?? p.modulo, emPreparacao: !m || !!m.emPreparacao,
      pedidoEm: p.pedido_em, quem: p.usuario?.nome ?? null, empresa: p.empresa ?? undefined,
    }
  })

  const recusados: PedidoRecusado[] = ((recusadosRaw ?? []) as unknown as Array<{
    id: number; modulo: string; pedido_em: string; recusado_em: string
    empresa: { id: number; nome: string } | null; usuario: { nome: string | null } | null; recusou: { nome: string | null } | null
  }>).map((p) => ({
    id: p.id, nome: moduloPorHref(p.modulo)?.nome ?? p.modulo, pedidoEm: p.pedido_em, quem: p.usuario?.nome ?? null,
    recusadoEm: p.recusado_em, recusadoPor: p.recusou?.nome ?? null, empresa: p.empresa ?? undefined,
  }))

  return (
    <div className="min-h-full bg-bg px-4 py-4 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Pedidos de módulo</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            O que as lojas pediram pela Central de Módulos. Atender instala o módulo na empresa. Recusar guarda o pedido como recusado, com data e quem recusou; a loja vê a recusa na Central e pode pedir de novo.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <Card title={`Em aberto (${pedidos.length})`}>
            <PedidosModulo pedidos={pedidos} />
          </Card>
          <Card title={`Recusados (${recusados.length}${recusados.length === RECUSADOS_NA_TELA ? '+' : ''})`}>
            <PedidosRecusados pedidos={recusados} />
          </Card>
        </div>
      </div>
    </div>
  )
}
