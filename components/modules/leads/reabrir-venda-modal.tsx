'use client'

import { useState } from 'react'
import { Modal, Button, Textarea } from '@/components/ui'

interface Props {
  leadNome: string
  loading?: boolean
  onConfirm: (motivo: string) => void
  onCancel: () => void
}

/**
 * TIRAR UMA VENDA DO GANHO (23/11/2026). Só aparece para dono e administrador; o banco confere
 * de novo (reabrir_negocio). O motivo é obrigatório (5 letras ou mais) e fica no histórico.
 */
export function ReabrirVendaModal({ leadNome, loading, onConfirm, onCancel }: Props) {
  const [motivo, setMotivo] = useState('')
  const valido = motivo.trim().length >= 5
  return (
    <Modal
      open
      onClose={() => !loading && onCancel()}
      size="sm"
      disableOverlayClose={loading}
      title="Reabrir esta venda?"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button variant="danger" onClick={() => onConfirm(motivo.trim())} loading={loading} disabled={!valido}>Reabrir venda</Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-ink-2">
        A venda de <strong className="text-ink">{leadNome || 'lead'}</strong> sai do ganho e volta para negociação.
        A data da venda é apagada; o motivo fica registrado no histórico, com o seu nome.
      </p>
      <Textarea label="Motivo da reabertura" rows={3} required value={motivo} onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ex.: o cliente desistiu antes da entrega; a venda foi marcada no lead errado."
        hint="Obrigatório (5 letras ou mais)." />
    </Modal>
  )
}
