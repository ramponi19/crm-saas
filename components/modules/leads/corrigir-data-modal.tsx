'use client'

import { useMemo, useState } from 'react'
import { Modal, Button, Input, Textarea, notify } from '@/components/ui'
import { useFuso } from '@/components/fuso-provider'
import { diaNoFuso } from '@/lib/datas'
import { DATA_MINIMA } from '@/lib/venda-ganho'

interface Props {
  leadId: number
  leadNome: string
  /** Data atual da venda (ganho_em). */
  ganhoEm: string | null
  onClose: () => void
  /** Data nova gravada (ganho_em). */
  onCorrigido: (ganhoEm: string | null) => void
}

/**
 * CORRIGIR A DATA DA VENDA (23/11/2026, M3). Só dono e administrador veem o botão; a RPC
 * `corrigir_data_venda` confere de novo, muda só a data (a venda continua fechada) e registra
 * no histórico. Data antes da entrada da empresa no Nexus é aceita com aviso.
 */
export function CorrigirDataModal({ leadId, leadNome, ganhoEm, onClose, onCorrigido }: Props) {
  const fuso = useFuso()
  const hoje = useMemo(() => diaNoFuso(new Date(), fuso), [fuso])
  const atual = ganhoEm ? diaNoFuso(new Date(ganhoEm), fuso) : ''
  const [data, setData] = useState(atual || hoje)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const valido = !!data && data !== atual && data <= hoje && data >= DATA_MINIMA && motivo.trim().length >= 5

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await fetch('/api/leads/corrigir-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, data, motivo: motivo.trim() }),
      })
      const j = await r.json().catch(() => ({})) as { error?: string; ganho_em?: string | null; avisos?: string[] }
      if (!r.ok) { setErro(j.error ?? 'Não foi possível corrigir a data.'); return }
      notify.ok('Data da venda corrigida', (j.avisos ?? []).join(' · ') || undefined)
      onCorrigido(j.ganho_em ?? null)
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => !salvando && onClose()}
      size="sm"
      disableOverlayClose={salvando}
      title="Corrigir data da venda"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando} disabled={!valido}>Corrigir data</Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-ink-2">
        A venda de <strong className="text-ink">{leadNome || 'lead'}</strong> continua fechada; muda só a data, que conta a
        régua de pós-venda. Fica registrado no histórico.
      </p>
      <div className="space-y-4">
        <Input label="Data da venda" type="date" value={data} max={hoje} min={DATA_MINIMA} required
          onChange={(e) => setData(e.target.value)}
          hint={data === atual ? 'É a data atual — escolha a correta.' : undefined} />
        <Textarea label="Motivo da correção" rows={2} required value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: a venda foi em 15/10 (pedido do grupo); o ganho foi marcado depois." hint="Obrigatório (5 letras ou mais)." />
        {erro && <p className="text-[13px] text-bad">{erro}</p>}
      </div>
    </Modal>
  )
}
