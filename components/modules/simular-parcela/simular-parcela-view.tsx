'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Card, Input, Select, StatCard } from '@/components/ui'

interface Taxa {
  forma_pagamento: string
  bandeira: string | null
  parcelas: number
  percentual_taxa: number
}

interface SimRow {
  parcelas: number
  taxa: number
  valorParcela: number
  totalJuros: number
}

const TIPOS = [
  { id: 'maquininha', label: 'Crédito (Maquininha)' },
  { id: 'link',       label: 'Link de Pagamento'    },
]

const BANDEIRAS = [
  { id: 'visa_master', label: 'Visa / Master'    },
  { id: 'outros',      label: 'Outros (Elo, Amex)' },
]

export function SimularParcelaView() {
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<'maquininha' | 'link'>('maquininha')
  const [bandeira, setBandeira] = useState<'visa_master' | 'outros'>('visa_master')
  const [taxas, setTaxas] = useState<Taxa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/taxas')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.taxas) setTaxas(json.taxas) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const valorNum = parseFloat(valor.replace(',', '.')) || 0

  // Filtra taxas do tipo/bandeira selecionados
  const taxasFiltradas = taxas.filter(t => {
    if (t.forma_pagamento !== tipo) return false
    if (tipo === 'maquininha' && t.bandeira !== bandeira) return false
    return true
  }).sort((a, b) => a.parcelas - b.parcelas)

  const rows: SimRow[] = taxasFiltradas.map(t => {
    const taxa = Number(t.percentual_taxa)
    const total = valorNum > 0 ? valorNum * (1 + taxa / 100) : 0
    return {
      parcelas: t.parcelas,
      taxa,
      valorParcela: t.parcelas > 0 ? total / t.parcelas : 0,
      totalJuros: total,
    }
  })

  const rowAVista = rows.find((r) => r.parcelas === 1)
  const rowMax = rows.length > 0 ? rows[rows.length - 1] : undefined

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto grid max-w-[1000px] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="Dados da venda">
          <div className="grid gap-4">
            <Input
              label="Valor da venda (R$)"
              className="num"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
            />
            <Select
              label="Forma de pagamento"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'maquininha' | 'link')}
            >
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            {tipo === 'maquininha' && (
              <Select
                label="Bandeira"
                value={bandeira}
                onChange={(e) => setBandeira(e.target.value as 'visa_master' | 'outros')}
              >
                {BANDEIRAS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </Select>
            )}
            <div className="rounded-card border border-line bg-raised px-3 py-2.5 text-[12.5px] text-ink-2">
              Compare crédito e link de pagamento — cada um com suas taxas. O cliente paga o valor{' '}
              <span className="num font-semibold text-ink">{formatCurrency(valorNum)}</span> mais os juros por parcela.
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card [&>*]:border-line-soft [&>*:nth-child(odd)]:border-r">
            <StatCard
              bare
              label="À vista (1x)"
              value={valorNum > 0 && rowAVista ? formatCurrency(rowAVista.totalJuros) : '—'}
            />
            <StatCard
              bare
              label={rowMax ? `Total em ${rowMax.parcelas}x` : 'Total parcelado'}
              value={valorNum > 0 && rowMax ? formatCurrency(rowMax.totalJuros) : '—'}
              delta={rowMax && rowMax.taxa > 0 ? `${rowMax.taxa.toFixed(2)}% de taxa` : undefined}
              deltaTone="warn"
            />
          </div>

          <Card title="Parcelas" flush>
            {loading ? (
              <div className="px-4 py-12 text-center text-[13px] text-ink-3">Carregando taxas...</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-12 text-center text-[13px] text-ink-3">
                Sem taxas cadastradas para esta modalidade.
              </div>
            ) : (
              <div className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <div key={r.parcelas} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="num font-semibold text-ink">{r.parcelas}x</span>
                      {r.parcelas === 1 && (
                        <span className="rounded-full bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                          Sem juros
                        </span>
                      )}
                      <span className="num text-ink-3">
                        {r.taxa > 0 ? `${r.taxa.toFixed(2)}%` : '—'}
                      </span>
                    </div>
                    <div className="num text-right text-ink-2">
                      {valorNum > 0 ? formatCurrency(r.valorParcela) : '—'}
                    </div>
                    <div className="num min-w-[92px] text-right font-semibold text-accent">
                      {valorNum > 0 ? formatCurrency(r.totalJuros) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <p className="text-[11.5px] text-ink-3">
            Valor por parcela e total com juros conforme as taxas cadastradas. O cliente paga o valor mais os juros da
            modalidade escolhida.
          </p>
        </div>
      </div>
    </main>
  )
}
