'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
      <div className="max-w-[920px] mx-auto animate-fade-up">

        {/* ── Input de valor + descrição ── */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] mb-[18px] flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="font-mono text-[10px] tracking-[0.16em] text-[#788698] mb-[6px]">VALOR DA VENDA</div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-[26px] text-[#788698]">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
                className="flex-1 bg-transparent border-none border-b-2 border-[rgba(215,40,47,0.4)] text-[#16212E] font-serif text-[34px] outline-none pb-[2px] min-w-0 focus:border-[#F0656B] transition-colors placeholder:text-[#3A4A63]"
              />
            </div>
          </div>
          <p className="text-[12.5px] text-[#788698] max-w-[260px] leading-[1.5]">
            Compare <strong className="text-[#1F2A39]">crédito</strong> e{' '}
            <strong className="text-[#1F2A39]">link de pagamento</strong> — cada um com suas taxas.
            O cliente paga o valor + juros por parcela.
          </p>
        </div>

        {/* ── Seletor de tipo ── */}
        <div className="flex gap-2 mb-[18px]">
          {TIPOS.map(t => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id as 'maquininha' | 'link')}
              className={cn(
                'flex-1 py-[13px] px-4 rounded-[13px] border text-[13.5px] font-semibold transition-all duration-150',
                tipo === t.id
                  ? 'bg-gradient-to-b from-[#E03037] to-[#C01F26] border-transparent text-white shadow-[0_6px_18px_rgba(215,40,47,0.32)]'
                  : 'bg-[#16212E]/[0.04] border-[#16212E]/[0.08] text-[#788698] hover:bg-[#16212E]/[0.04] hover:text-[#56657A]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Seletor de bandeira (só maquininha) ── */}
        {tipo === 'maquininha' && (
          <div className="flex gap-2 mb-[18px]">
            {BANDEIRAS.map(b => (
              <button
                key={b.id}
                onClick={() => setBandeira(b.id as 'visa_master' | 'outros')}
                className={cn(
                  'px-[16px] py-[8px] rounded-[10px] border text-[12.5px] font-semibold transition-all duration-150 font-mono',
                  bandeira === b.id
                    ? 'bg-[#16212E]/[0.04] border-[#16212E]/[0.08] text-[#16212E]'
                    : 'bg-transparent border-[#16212E]/[0.08] text-[#788698] hover:border-[#16212E]/[0.08] hover:text-[#9FB0C2]'
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Tabela ── */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] overflow-hidden">
          {/* Header */}
          <div className="grid gap-3 px-6 py-4 font-mono text-[9.5px] tracking-[0.1em] text-[#9AA7B6] border-b border-[#16212E]/[0.08]"
            style={{ gridTemplateColumns: '1fr 1fr 1.3fr 1.3fr' }}>
            <div>PARCELAS</div>
            <div className="text-right">TAXA</div>
            <div className="text-right">VALOR DA PARCELA</div>
            <div className="text-right">TOTAL C/ JUROS</div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-[#788698] font-mono text-[12px]">Carregando taxas...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-[#788698] font-mono text-[12px]">Sem taxas cadastradas para esta modalidade.</div>
          ) : (
            rows.map((r, _i) => (
              <div
                key={r.parcelas}
                className={cn(
                  'grid gap-3 px-6 py-[13px] border-b border-[#16212E]/[0.08] last:border-0 transition-colors hover:bg-[#16212E]/[0.04]',
                  r.parcelas === 1 && 'bg-white/[0.015]'
                )}
                style={{ gridTemplateColumns: '1fr 1fr 1.3fr 1.3fr' }}
              >
                {/* Parcelas */}
                <div className="text-[14px] font-bold text-[#16212E]">
                  {r.parcelas}x
                  {r.parcelas === 1 && (
                    <span className="ml-2 font-mono text-[9px] tracking-[0.08em] text-[#34D399] bg-[rgba(52,211,153,0.1)] px-[6px] py-[2px] rounded-full">
                      SEM JUROS
                    </span>
                  )}
                </div>

                {/* Taxa */}
                <div className="text-right font-mono text-[12.5px] text-[#788698]">
                  {r.taxa > 0 ? `${r.taxa.toFixed(2)}%` : '—'}
                </div>

                {/* Valor da parcela */}
                <div className="text-right text-[13.5px] font-semibold text-[#1F2A39]">
                  {valorNum > 0 ? formatCurrency(r.valorParcela) : '—'}
                </div>

                {/* Total com juros */}
                <div className="text-right text-[13.5px] font-bold text-[#F0656B]">
                  {valorNum > 0 ? formatCurrency(r.totalJuros) : '—'}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </main>
  )
}
