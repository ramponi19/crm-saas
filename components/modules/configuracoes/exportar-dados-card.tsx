'use client'

import { useState } from 'react'
import { Download, Users, Target, ShoppingBag } from 'lucide-react'
import { Card, Button, notify } from '@/components/ui'

const TIPOS = [
  { tipo: 'leads', label: 'Leads', desc: 'Nome, telefone, origem, etapa do funil', Icon: Target },
  { tipo: 'clientes', label: 'Clientes', desc: 'Nome, contato, documento', Icon: Users },
  { tipo: 'vendas', label: 'Vendas', desc: 'Valor, forma de pagamento, status', Icon: ShoppingBag },
] as const

export function ExportarDadosCard() {
  const [baixando, setBaixando] = useState<string | null>(null)

  async function exportar(tipo: string) {
    setBaixando(tipo)
    try {
      const res = await fetch(`/api/exportar?tipo=${tipo}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Falha ao exportar')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tipo}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      notify.ok(`Exportação de ${tipo} concluída`)
    } catch (e) {
      notify.bad('Não foi possível exportar', e instanceof Error ? e.message : undefined)
    } finally {
      setBaixando(null)
    }
  }

  return (
    <Card title="Exportar dados">
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Baixe seus dados em CSV (abre no Excel/Planilhas). Disponível conforme a permissão de exportação do seu perfil.
      </p>
      <div className="flex flex-col gap-3">
        {TIPOS.map(({ tipo, label, desc, Icon }) => (
          <div key={tipo} className="flex items-center gap-3.5 rounded-card border border-line bg-raised px-4 py-3.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-ink/[0.04] text-ink-3">
              <Icon size={17} strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">{label}</div>
              <div className="text-[11.5px] text-ink-2">{desc}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={baixando === tipo}
              icon={<Download size={14} strokeWidth={1.7} />}
              onClick={() => exportar(tipo)}
            >
              CSV
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
