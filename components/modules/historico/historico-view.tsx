'use client'

import { useState, useMemo } from 'react'
import { Download } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface Venda {
  id: number
  data_venda: string | null
  cliente_nome: string | null
  produto_nome: string | null
  vendedor_nome: string | null
  canal_venda: string | null
  forma_pagamento: string | null
  valor_venda: number
  lucro: number | null
  status: string | null
  parcelas: number | null
}

interface Props { vendas: Venda[] }

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  concluida:  { label: 'Concluída',  bg: 'rgba(52,211,153,0.12)',  color: '#34D399' },
  pendente:   { label: 'Pendente',   bg: 'rgba(244,183,64,0.12)',  color: '#F4B740' },
  cancelada:  { label: 'Cancelada',  bg: 'rgba(240,101,107,0.12)', color: '#F0656B' },
  devolvido:  { label: 'Devolvido',  bg: 'rgba(127,176,232,0.12)', color: '#7FB0E8' },
}

const CANAL_LABEL: Record<string, string> = {
  loja_fisica: 'Loja física', whatsapp: 'WhatsApp',
  instagram: 'Instagram', site: 'Site', link: 'Link',
}

const CHIPS = [
  { key: 'all',       label: 'Todas'       },
  { key: 'concluida', label: 'Concluídas'  },
  { key: 'pendente',  label: 'Pendentes'   },
  { key: 'cancelada', label: 'Canceladas'  },
  { key: 'devolvido', label: 'Devolvidos'  },
]

function exportCSV(rows: Venda[]) {
  const header = 'Data,Cliente,Produto,Vendedor,Canal,Pagamento,Valor,Lucro,Status'
  const lines = rows.map(v => [
    v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '',
    v.cliente_nome ?? '', v.produto_nome ?? '', v.vendedor_nome ?? '',
    CANAL_LABEL[v.canal_venda ?? ''] ?? v.canal_venda ?? '',
    v.forma_pagamento ?? '',
    v.valor_venda, v.lucro ?? 0, v.status ?? '',
  ].join(','))
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `historico_${new Date().toISOString().slice(0,10)}.csv`; a.click()
}

export function HistoricoView({ vendas }: Props) {
  const [filtro, setFiltro] = useState('all')

  const stats = useMemo(() => {
    const conc = vendas.filter(v => v.status === 'concluida')
    return {
      total:      vendas.length,
      faturamento: conc.reduce((s, v) => s + v.valor_venda, 0),
      lucro:       conc.reduce((s, v) => s + (v.lucro ?? 0), 0),
      canceladas:  vendas.filter(v => v.status === 'cancelada').length,
    }
  }, [vendas])

  const filtered = useMemo(() =>
    filtro === 'all' ? vendas : vendas.filter(v => v.status === filtro),
    [vendas, filtro]
  )

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
      <div className="max-w-[1320px] mx-auto animate-fade-up space-y-[18px]">

        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'VENDAS NO PERÍODO', val: String(stats.total)          },
            { label: 'FATURAMENTO',       val: formatCurrency(stats.faturamento) },
            { label: 'LUCRO BRUTO',       val: formatCurrency(stats.lucro)  },
            { label: 'CANCELADAS',        val: String(stats.canceladas)      },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.025] border border-white/[0.05] rounded-[14px] px-5 py-4">
              <div className="font-mono text-[10px] tracking-[0.1em] text-[#6B7C92]">{s.label}</div>
              <div className="font-serif text-[24px] text-[#F4F6F9] mt-1">{s.val}</div>
            </div>
          ))}
        </div>

        {/* Chips + Exportar */}
        <div className="flex items-center gap-[10px] flex-wrap">
          <div className="flex gap-2">
            {CHIPS.map(c => (
              <button key={c.key} onClick={() => setFiltro(c.key)}
                className={cn(
                  'px-[14px] py-[8px] rounded-[10px] text-[13px] font-semibold border transition-all',
                  filtro === c.key
                    ? 'bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white border-transparent shadow-[0_4px_14px_rgba(215,40,47,0.32)]'
                    : 'bg-white/[0.03] border-white/[0.08] text-[#8A9BB0] hover:bg-white/[0.06] hover:text-[#D4DEEA]'
                )}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => exportCSV(filtered)}
            className="flex items-center gap-2 px-[16px] py-[10px] rounded-[11px] bg-white/[0.04] border border-white/[0.08] text-[#C4CCD6] text-[13px] font-semibold hover:bg-white/[0.08] transition-colors">
            <Download size={16} /> Exportar
          </button>
        </div>

        {/* Tabela */}
        <div className="bg-[#122036] border border-white/[0.06] rounded-[18px] overflow-x-auto">
          <div style={{ minWidth: 880 }}>
            {/* Header */}
            <div className="grid gap-3 px-6 py-4 font-mono text-[9.5px] tracking-[0.1em] text-[#4F6178] border-b border-white/[0.06]"
              style={{ gridTemplateColumns: '1.1fr 1.5fr 1.7fr 1fr 1fr 1fr .9fr' }}>
              <div>DATA</div>
              <div>CLIENTE</div>
              <div>PRODUTO</div>
              <div>VENDEDOR</div>
              <div>PAGAMENTO</div>
              <div className="text-right">VALOR / LUCRO</div>
              <div className="text-right">STATUS</div>
            </div>

            {/* Rows */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-[#5C6E84] text-[13px]">
                Nenhuma venda encontrada.
              </div>
            ) : filtered.map(v => {
              const st  = STATUS_META[v.status ?? ''] ?? STATUS_META.pendente
              const lucroPos = (v.lucro ?? 0) >= 0
              const pgto = [
                v.forma_pagamento ?? '',
                v.parcelas && v.parcelas > 1 ? `${v.parcelas}x` : '',
              ].filter(Boolean).join(' · ')

              return (
                <div key={v.id}
                  className="grid gap-3 px-6 py-[13px] border-b border-white/[0.04] last:border-0 items-center cursor-pointer hover:bg-white/[0.025] transition-colors"
                  style={{ gridTemplateColumns: '1.1fr 1.5fr 1.7fr 1fr 1fr 1fr .9fr' }}>

                  {/* Data */}
                  <div className="font-mono text-[11px] text-[#8A9BB0]">
                    {v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—'}
                  </div>

                  {/* Cliente */}
                  <div className="text-[13px] font-semibold text-[#E9EEF4] truncate">
                    {v.cliente_nome ?? '—'}
                  </div>

                  {/* Produto */}
                  <div className="text-[12.5px] text-[#B7C2D0] truncate">
                    {v.produto_nome ?? v.forma_pagamento ?? '—'}
                  </div>

                  {/* Vendedor */}
                  <div className="text-[12.5px] text-[#8A9BB0] truncate">
                    {v.vendedor_nome ?? '—'}
                  </div>

                  {/* Pagamento + Canal */}
                  <div className="flex items-center gap-[7px] min-w-0">
                    <span className="text-[12px] text-[#8A9BB0] truncate">{pgto || '—'}</span>
                  </div>

                  {/* Valor + Lucro */}
                  <div className="text-right">
                    <div className="text-[13.5px] font-bold text-[#F4F6F9]">
                      {formatCurrency(v.valor_venda)}
                    </div>
                    {v.lucro != null && (
                      <div className={cn('text-[11px] font-semibold', lucroPos ? 'text-[#34D399]' : 'text-[#F0656B]')}>
                        {lucroPos ? '+' : ''}{formatCurrency(v.lucro)}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="text-right">
                    <span className="px-[10px] py-[4px] rounded-full text-[11px] font-semibold whitespace-nowrap"
                      style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </main>
  )
}
