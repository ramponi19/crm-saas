'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge, Button, ConfirmDialog, notify } from '@/components/ui'

/**
 * Lista de pedidos de módulo com Atender / Recusar (22/10/2026). Usada na tela de
 * pedidos do superadmin (todas as empresas) e na tela de cada empresa.
 * Atender instala; recusar apaga e fica no log (/api/superadmin/modulos/pedidos/[id]).
 */
export interface PedidoModulo {
  id: number
  modulo: string
  nome: string
  emPreparacao: boolean
  pedidoEm: string
  quem: string | null
  empresa?: { id: number; nome: string }
}

const dia = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export function PedidosModulo({ pedidos }: { pedidos: PedidoModulo[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [recusar, setRecusar] = useState<PedidoModulo | null>(null)

  async function agir(p: PedidoModulo, acao: 'atender' | 'recusar') {
    setOcupado(p.id)
    try {
      const r = await fetch(`/api/superadmin/modulos/pedidos/${p.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad(j.error ?? 'Não deu certo.'); return }
      notify.ok(acao === 'atender' ? `${p.nome} instalado.` : 'Pedido recusado.')
      setRecusar(null)
      router.refresh()
    } finally {
      setOcupado(null)
    }
  }

  if (pedidos.length === 0) return <p className="text-[13px] text-ink-3">Nenhum pedido em aberto.</p>

  return (
    <div className="flex flex-col divide-y divide-line-soft">
      {pedidos.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 text-[13px]">
          <Badge tone="warn">{p.nome}</Badge>
          {p.empresa && (
            <Link href={`/superadmin/empresas/${p.empresa.id}`} className="font-medium text-ink hover:underline">{p.empresa.nome}</Link>
          )}
          <span className="text-ink-2">pedido por {p.quem ?? 'alguém da loja'} em {dia(p.pedidoEm)}</span>
          <span className="ml-auto flex items-center gap-2">
            {p.emPreparacao && <span className="text-[11.5px] text-ink-3">em preparação: só recusar</span>}
            <Button size="sm" disabled={p.emPreparacao} loading={ocupado === p.id && !recusar} onClick={() => agir(p, 'atender')}>Atender</Button>
            <Button size="sm" variant="outline" disabled={ocupado === p.id} onClick={() => setRecusar(p)}>Recusar</Button>
          </span>
        </div>
      ))}
      <ConfirmDialog
        open={!!recusar}
        onClose={() => setRecusar(null)}
        onConfirm={() => recusar && agir(recusar, 'recusar')}
        title={`Recusar o pedido de ${recusar?.nome ?? ''}?`}
        description="O pedido é apagado e a recusa fica no log do superadmin. A loja pode pedir de novo."
        confirmLabel="Recusar"
        tone="danger"
        loading={!!recusar && ocupado === recusar.id}
      />
    </div>
  )
}
