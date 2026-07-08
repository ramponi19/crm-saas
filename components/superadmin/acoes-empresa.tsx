'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CreditCard, Power, CalendarClock, Eye, Shapes } from 'lucide-react'
import { SEGMENTOS_LISTA } from '@/lib/segmentos'
import { Card, Button, Modal, Select, Input } from '@/components/ui'

// Roxo da plataforma (superadmin) — único toque de accent permitido aqui.
const PLATFORM = '#6D28D9'

interface Props {
  empresaId: number
  empresaNome: string
  planoAtual: string
  statusAtual: string
  segmentoAtual: string
}

type ModalTipo = 'plano' | 'status' | 'trial' | 'segmento' | null

const MODAL_TITULO: Record<Exclude<ModalTipo, null>, string> = {
  plano: 'Trocar plano',
  segmento: 'Trocar segmento',
  status: 'Alterar status',
  trial: 'Estender trial',
}

export function AcoesEmpresa({ empresaId, empresaNome, planoAtual, statusAtual, segmentoAtual }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalTipo>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // estados dos formulários
  const [novoPlano, setNovoPlano] = useState(planoAtual)
  const [novoStatus, setNovoStatus] = useState(statusAtual)
  const [diasTrial, setDiasTrial] = useState(14)
  const [novoSegmento, setNovoSegmento] = useState(segmentoAtual)

  async function executar(body: Record<string, unknown>) {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch(`/api/superadmin/empresas/${empresaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao executar ação')
        return
      }
      setModal(null)
      router.refresh()
    } catch {
      setErro('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  async function impersonar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/empresas/${empresaId}/impersonar`, {
        method: 'POST',
      })
      if (res.ok) {
        // Navegação hard (não router.push): força um render fresco do servidor
        // já com a empresa impersonada. Um push para /dashboard serviria o
        // payload em cache da impersonação anterior ("retorna para a JM").
        window.location.href = '/dashboard'
        return
      }
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const botoes = [
    { tipo: 'plano' as const, label: 'Trocar plano', icon: CreditCard },
    { tipo: 'segmento' as const, label: 'Trocar segmento', icon: Shapes },
    { tipo: 'status' as const, label: 'Alterar status', icon: Power },
    { tipo: 'trial' as const, label: 'Estender trial', icon: CalendarClock },
  ]

  function confirmar() {
    if (modal === 'plano') executar({ tipo: 'trocar_plano', plano: novoPlano })
    if (modal === 'segmento') executar({ tipo: 'alterar_segmento', segmento: novoSegmento })
    if (modal === 'status') executar({ tipo: 'alterar_status', status: novoStatus })
    if (modal === 'trial') executar({ tipo: 'estender_trial', dias: diasTrial })
  }

  return (
    <>
      <Card title="Ações administrativas">
        <div className="flex flex-wrap gap-2.5">
          {botoes.map(b => {
            const Icon = b.icon
            return (
              <Button
                key={b.tipo}
                variant="outline"
                icon={<Icon size={16} strokeWidth={1.7} />}
                onClick={() => { setErro(null); setModal(b.tipo) }}
              >
                {b.label}
              </Button>
            )
          })}
          <Button
            onClick={impersonar}
            loading={loading}
            icon={<Eye size={16} strokeWidth={1.7} />}
            style={{ background: PLATFORM }}
            className="text-white hover:opacity-90"
          >
            Entrar como esta empresa
          </Button>
        </div>
      </Card>

      {/* Modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        size="sm"
        disableOverlayClose={loading}
        title={modal ? MODAL_TITULO[modal] : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)} disabled={loading}>Cancelar</Button>
            <Button onClick={confirmar} loading={loading} style={{ background: PLATFORM }} className="text-white hover:opacity-90">
              {loading ? 'Aplicando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[13px] text-ink-2">{empresaNome}</p>

        {modal === 'plano' && (
          <Select label="Plano" value={novoPlano} onChange={e => setNovoPlano(e.target.value)}>
            {['free', 'starter', 'pro'].map(p => (
              <option key={p} value={p} className="capitalize">{p}</option>
            ))}
          </Select>
        )}

        {modal === 'segmento' && (
          <Select label="Segmento" value={novoSegmento} onChange={e => setNovoSegmento(e.target.value)}>
            {SEGMENTOS_LISTA.map(({ id, config }) => (
              <option key={id} value={id}>{config.label}</option>
            ))}
          </Select>
        )}

        {modal === 'status' && (
          <Select label="Status" value={novoStatus} onChange={e => setNovoStatus(e.target.value)}>
            {['ativo', 'suspenso', 'cancelado'].map(s => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </Select>
        )}

        {modal === 'trial' && (
          <div>
            <Input
              label="Dias a adicionar (a partir de hoje)"
              type="number"
              min={1}
              max={365}
              value={diasTrial}
              onChange={e => setDiasTrial(Number(e.target.value))}
            />
            <div className="mt-2 flex gap-2">
              {[7, 14, 30, 60].map(d => (
                <Button key={d} variant="outline" size="sm" onClick={() => setDiasTrial(d)}>
                  {d}d
                </Button>
              ))}
            </div>
          </div>
        )}

        {erro && <p className="mt-3 text-[13px] text-bad">{erro}</p>}
      </Modal>
    </>
  )
}
