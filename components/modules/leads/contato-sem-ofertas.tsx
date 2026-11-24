'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellOff } from 'lucide-react'
import { Badge, notify } from '@/components/ui'
import { useFuso } from '@/components/fuso-provider'
import { formatarData } from '@/lib/datas'

/**
 * SELO "SEM OFERTAS" NO CARD DO CLIENTE (core, 24/11/2026). O cliente que tocou "Não quero receber ofertas" (ou pediu
 * à equipe) não recebe modelo de Marketing — Transmissão, Automatize e pós-venda; os avisos de Utilidade continuam.
 * Marcar: qualquer pessoa da empresa, a pedido do cliente. Desfazer: dono ou administrador (a rota responde 403).
 */
export function ContatoSemOfertas({ contatoId }: { contatoId: number }) {
  const fuso = useFuso()
  const [estado, setEstado] = useState<{ sem_ofertas_em: string | null; sem_ofertas_origem: string | null } | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ler = useCallback(async () => {
    const r = await fetch(`/api/contatos/sem-ofertas?contato=${contatoId}`)
    if (r.ok) setEstado(await r.json())
  }, [contatoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a leitura inicial do selo vem da rota
  useEffect(() => { ler() }, [ler])

  async function mudar(ligar: boolean) {
    if (!ligar && !window.confirm('Voltar a enviar ofertas para este cliente? Faça isso só se ele pediu.')) return
    setSalvando(true)
    const r = await fetch('/api/contatos/sem-ofertas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contato_id: contatoId, ligar }) })
    const j = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível salvar'); return }
    notify.ok(ligar ? 'Cliente marcado: não recebe ofertas' : 'Cliente volta a receber ofertas')
    ler()
  }

  if (!estado) return null
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]" data-sem-ofertas={estado.sem_ofertas_em ? 'sim' : 'nao'}>
      {estado.sem_ofertas_em ? (
        <>
          <Badge tone="warn"><BellOff size={11} strokeWidth={1.9} className="mr-1 inline" />Sem ofertas desde {formatarData(estado.sem_ofertas_em, { day: '2-digit', month: '2-digit' }, '', fuso)}</Badge>
          <button type="button" disabled={salvando} onClick={() => mudar(false)} className="text-[12px] font-medium text-ink-2 hover:text-ink disabled:opacity-50">Desfazer</button>
        </>
      ) : (
        <button type="button" disabled={salvando} onClick={() => mudar(true)} className="text-[12px] font-medium text-ink-3 hover:text-ink-2 disabled:opacity-50">
          Cliente não quer receber ofertas
        </button>
      )}
    </div>
  )
}
