'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Trash2, TriangleAlert } from 'lucide-react'
import { Card, Button, Input, Modal, notify } from '@/components/ui'

export function ZonaPerigo({ empresaId, empresaNome }: { empresaId: number; empresaNome: string }) {
  const router = useRouter()
  const [baixando, setBaixando] = useState(false)
  const [modal, setModal] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  async function exportar() {
    setBaixando(true)
    try {
      const res = await fetch(`/api/superadmin/empresas/${empresaId}/exportar`)
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lgpd-${empresaId}-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      notify.ok('Exportação concluída', 'ZIP com os CSVs baixado.')
    } catch (e) {
      notify.bad('Não foi possível exportar', e instanceof Error ? e.message : undefined)
    } finally {
      setBaixando(false)
    }
  }

  async function excluir() {
    setExcluindo(true)
    try {
      const res = await fetch(`/api/superadmin/empresas/${empresaId}/excluir`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacao }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao excluir') }
      notify.ok('Empresa excluída')
      router.push('/superadmin/empresas')
    } catch (e) {
      notify.bad('Não foi possível excluir', e instanceof Error ? e.message : undefined)
      setExcluindo(false)
    }
  }

  const confere = confirmacao.trim() === empresaNome

  return (
    <>
      <Card title="LGPD & dados">
        <div className="flex flex-col gap-4">
          {/* Exportar */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-ink">Exportar todos os dados</div>
              <div className="text-[12px] text-ink-3">ZIP de CSVs — atende o direito de acesso/portabilidade.</div>
            </div>
            <Button variant="outline" loading={baixando} icon={<Download size={15} strokeWidth={1.7} />} onClick={exportar}>
              Exportar ZIP
            </Button>
          </div>

          {/* Excluir (zona de perigo) */}
          <div className="flex items-center justify-between gap-4 rounded-card border border-bad/25 bg-bad/[0.04] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-bad">
                <TriangleAlert size={15} strokeWidth={1.8} /> Excluir empresa definitivamente
              </div>
              <div className="text-[12px] text-ink-3">Apaga todos os dados em cascata. Ação irreversível.</div>
            </div>
            <Button variant="danger" icon={<Trash2 size={15} strokeWidth={1.7} />} onClick={() => { setConfirmacao(''); setModal(true) }}>
              Excluir
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={modal}
        onClose={() => !excluindo && setModal(false)}
        size="sm"
        disableOverlayClose={excluindo}
        title="Excluir empresa definitivamente"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={excluindo}>Cancelar</Button>
            <Button variant="danger" onClick={excluir} loading={excluindo} disabled={!confere}>
              Excluir para sempre
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-ink-2">
          Isso apaga <strong className="text-ink">todos os dados</strong> de <strong className="text-ink">{empresaNome}</strong>{' '}
          (leads, mensagens, clientes, vendas, produtos, financeiro…) de forma <strong className="text-bad">irreversível</strong>.
          As contas de login não são apagadas.
        </p>
        <Input
          label={`Digite "${empresaNome}" para confirmar`}
          value={confirmacao}
          onChange={e => setConfirmacao(e.target.value)}
          placeholder={empresaNome}
          autoFocus
        />
      </Modal>
    </>
  )
}
