'use client'

import { useState } from 'react'
import { Modal, Button, Select, Textarea } from '@/components/ui'
import type { Motivo } from './types'

interface Props {
  leadNome: string
  motivos: Motivo[]
  loading?: boolean
  onConfirm: (motivoId: number, observacao: string) => void
  onCancel: () => void
}

export function MotivoPerdaModal({ leadNome, motivos, loading, onConfirm, onCancel }: Props) {
  const [motivoId, setMotivoId] = useState<string>('')
  const [obs, setObs] = useState('')

  return (
    <Modal
      open
      onClose={() => !loading && onCancel()}
      size="sm"
      disableOverlayClose={loading}
      title="Por que perdeu este lead?"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => onConfirm(Number(motivoId), obs.trim())}
            loading={loading}
            disabled={!motivoId}
          >
            Marcar como perdido
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-ink-2">
        Registrar o motivo da perda de <strong className="text-ink">{leadNome || 'lead'}</strong> mantém seu relatório
        de perdas confiável. É obrigatório.
      </p>

      {motivos.length === 0 ? (
        <p className="text-[13px] text-warn">
          Nenhum motivo cadastrado. Configure em Configurações → Motivos de perda.
        </p>
      ) : (
        <div className="space-y-3">
          <Select label="Motivo" value={motivoId} onChange={e => setMotivoId(e.target.value)} required>
            <option value="">Selecione…</option>
            {motivos.map(m => <option key={m.id} value={String(m.id)}>{m.label}</option>)}
          </Select>

          {/* JUSTIFICATIVA — texto livre, e de propósito NÃO obrigatória.
              O motivo da lista alimenta o relatório; a justificativa é o contexto
              que a lista não cabe ("ia fechar, mas o cartão não passou"). Obrigar
              texto no meio do atendimento produz "asd" e "n quis": campo cumprido,
              informação nenhuma. */}
          <Textarea
            label="Justificativa"
            rows={3}
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="O que aconteceu? Ex.: achou caro depois de ver o parcelamento; disse que voltaria no mês que vem."
            hint="Opcional, mas é o que ajuda a entender a perda depois."
          />
        </div>
      )}
    </Modal>
  )
}
