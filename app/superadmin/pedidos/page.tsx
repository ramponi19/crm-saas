import { createServiceClient } from '@/lib/supabase/service'
import { Card } from '@/components/ui'
import { moduloPorHref } from '@/core/modulos'
import { PedidosModulo, type PedidoModulo } from '@/components/superadmin/pedidos-modulo'

export const metadata = { title: 'Pedidos de módulo' }

/**
 * Pedidos de módulo de todas as empresas (22/10/2026): o dono pede pela Central
 * de Módulos o que é pago (fora do plano ou contratado à parte); aqui se atende
 * (instala) ou recusa (apaga, com log). Rota trancada no superadmin/layout.
 */
export default async function PedidosModuloPage() {
  const svc = createServiceClient()
  const { data } = await svc.from('modulo_pedidos')
    .select('id, modulo, pedido_em, empresa:empresas(id, nome), usuario:usuarios!modulo_pedidos_pedido_por_fkey(nome)')
    .is('atendido_em', null).order('pedido_em')

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

  return (
    <div className="min-h-full bg-bg px-4 py-4 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Pedidos de módulo</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            O que as lojas pediram pela Central de Módulos. Atender instala o módulo na empresa; recusar apaga o pedido e fica no log.
          </p>
        </div>
        <Card title={`Em aberto (${pedidos.length})`}>
          <PedidosModulo pedidos={pedidos} />
        </Card>
      </div>
    </div>
  )
}
