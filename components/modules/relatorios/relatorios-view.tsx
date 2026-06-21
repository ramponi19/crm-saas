'use client'

import { useState, useMemo } from 'react'
import { TrendingUp, Boxes, Users, Download, Search } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface Venda {
  id: number
  data_venda: string | null
  cliente_nome: string | null
  produto_nome: string | null
  vendedor_nome: string | null
  canal_venda: string | null
  valor_venda: number
  desconto_valor: number | null
  lucro: number | null
  forma_pagamento: string | null
  status: string | null
}

interface Lancamento {
  id: number
  data_venc: string
  descricao: string | null
  categoria: string | null
  tipo: string
  valor: number
  status: string
}

interface Props {
  vendas: Venda[]
  lancamentos: Lancamento[]
  vendedores: string[]
}

const CANAL_LABEL: Record<string, string> = {
  loja_fisica: 'Loja física', whatsapp: 'WhatsApp',
  instagram: 'Instagram', site: 'Site', link: 'Link',
}

const TABS = [
  { id: 'vendas',    label: 'Vendas',   Icon: TrendingUp },
  { id: 'estoque',   label: 'Estoque',  Icon: Boxes      },
  { id: 'clientes',  label: 'Clientes', Icon: Users      },
  { id: 'exportar',  label: 'Exportar', Icon: Download   },
]

function exportCSV(rows: Venda[]) {
  const header = 'Data,Cliente,Produto,Vendedor,Canal,Valor,Desconto,Lucro'
  const lines = rows.map(v => [
    v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '',
    v.cliente_nome ?? '', v.produto_nome ?? '', v.vendedor_nome ?? '',
    CANAL_LABEL[v.canal_venda ?? ''] ?? v.canal_venda ?? '',
    v.valor_venda, v.desconto_valor ?? 0, v.lucro ?? 0,
  ].join(','))
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `vendas_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}

function BarChart({ vendas }: { vendas: Venda[] }) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const total = vendas
      .filter(v => v.data_venda?.startsWith(key) && v.status === 'concluida')
      .reduce((s, v) => s + v.valor_venda, 0)
    return { label, total }
  })
  const maxVal = Math.max(...days.map(d => d.total), 1)
  const W = 700, H = 160, pb = 28, pt = 10
  const barW = 48, gap = (W - days.length * barW) / (days.length + 1)
  return (
    <svg viewBox={`0 0 ${W} ${H + pb}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0454D" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#8E1B20" stopOpacity={0.7} />
        </linearGradient>
      </defs>
      {days.map((d, i) => {
        const x = gap + i * (barW + gap)
        const barH = Math.max(((d.total / maxVal) * H) - pt, d.total > 0 ? 4 : 0)
        const y = pt + (H - barH)
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={6}
              fill={d.total > 0 ? 'url(#bg)' : 'rgba(255,255,255,0.04)'} />
            {d.total > 0 && (
              <text x={x + barW / 2} y={y - 6} textAnchor="middle"
                fill="#9FB0C2" fontSize={9} fontFamily="JetBrains Mono, monospace">
                {formatCurrency(d.total).replace('R$\u00a0', '')}
              </text>
            )}
            <text x={x + barW / 2} y={H + pb - 4} textAnchor="middle"
              fill="#4F6178" fontSize={10} fontFamily="JetBrains Mono, monospace">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function RelatoriosView({ vendas, lancamentos, vendedores }: Props) {
  const [aba, setAba]           = useState('vendas')
  const [dataIni, setDataIni]   = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [dataFim, setDataFim]   = useState(() => new Date().toISOString().slice(0, 10))
  const [vendedor, setVendedor] = useState('Todos')

  const vendasFiltradas = useMemo(() => vendas.filter(v => {
    if (!v.data_venda) return false
    const d = v.data_venda.slice(0, 10)
    if (d < dataIni || d > dataFim) return false
    if (vendedor !== 'Todos' && v.vendedor_nome !== vendedor) return false
    return true
  }), [vendas, dataIni, dataFim, vendedor])

  const kpis = useMemo(() => {
    const conc     = vendasFiltradas.filter(v => v.status === 'concluida')
    const receita  = conc.reduce((s, v) => s + v.valor_venda, 0)
    const lucro    = conc.reduce((s, v) => s + (v.lucro ?? 0), 0)
    const qtd      = conc.length
    const ticket   = qtd > 0 ? receita / qtd : 0
    const descontos = conc.reduce((s, v) => s + (v.desconto_valor ?? 0), 0)
    return [
      { l: 'TOTAL VENDAS',  v: formatCurrency(receita),  c: '#F0656B' },
      { l: 'LUCRO TOTAL',   v: formatCurrency(lucro),    c: '#34D399' },
      { l: 'TICKET MÉDIO',  v: formatCurrency(ticket),   c: '#7FB0E8' },
      { l: 'DESCONTOS',     v: formatCurrency(descontos),c: '#F4B740' },
      { l: 'QTD. VENDAS',   v: String(qtd),              c: '#C6A86A' },
    ]
  }, [vendasFiltradas])

  const mesAtual  = new Date().toISOString().slice(0, 7)
  const lancMes   = lancamentos.filter(l => l.data_venc.startsWith(mesAtual))
  const entradas  = lancMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
  const saidas    = lancMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
  const saldo     = entradas - saidas

  const inputCls = "bg-white/[0.04] border border-white/[0.08] rounded-[10px] px-3 py-[9px] text-[#E9EEF4] text-[13px] outline-none focus:border-[rgba(215,40,47,0.5)] transition-colors [color-scheme:dark]"

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
      <div className="max-w-[1320px] mx-auto animate-fade-up space-y-4">

        {/* Tabs */}
        <div className="flex gap-[4px] bg-[#0E1A2B] border border-white/[0.06] rounded-[13px] p-[5px] w-max overflow-x-auto">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setAba(id)}
              className={cn(
                'flex items-center gap-2 px-[16px] py-[9px] rounded-[9px] text-[13.5px] font-semibold transition-all whitespace-nowrap',
                aba === id
                  ? 'bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white shadow-[0_4px_14px_rgba(215,40,47,0.35)]'
                  : 'text-[#6B7C92] hover:text-[#C4CCD6] hover:bg-white/[0.04]'
              )}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* ── ABA VENDAS ── */}
        {aba === 'vendas' && (<>
          {/* Filtros */}
          <div className="bg-[#122036] border border-white/[0.06] rounded-[16px] p-[16px_18px] flex items-end gap-4 flex-wrap">
            <div>
              <div className="font-mono text-[10px] tracking-[0.12em] text-[#6B7C92] mb-[6px]">INÍCIO</div>
              <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className={inputCls} />
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.12em] text-[#6B7C92] mb-[6px]">FIM</div>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={inputCls} />
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="font-mono text-[10px] tracking-[0.12em] text-[#6B7C92] mb-[6px]">VENDEDOR</div>
              <select value={vendedor} onChange={e => setVendedor(e.target.value)}
                className={cn(inputCls, 'w-full cursor-pointer')}>
                <option style={{ background: '#0E1A2C' }}>Todos</option>
                {vendedores.map(v => (
                  <option key={v} style={{ background: '#0E1A2C' }}>{v}</option>
                ))}
              </select>
            </div>
            <button className="flex items-center gap-2 px-[18px] py-[11px] rounded-[10px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13px] hover:-translate-y-[1px] transition-all shadow-[0_4px_14px_rgba(215,40,47,0.3)]">
              <Search size={15} /> Gerar
            </button>
            <button onClick={() => exportCSV(vendasFiltradas)}
              className="flex items-center gap-2 px-[16px] py-[11px] rounded-[10px] border border-white/[0.1] bg-white/[0.04] text-[#C4CCD6] font-semibold text-[13px] hover:bg-white/[0.09] transition-colors">
              <Download size={15} /> CSV
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-5 gap-[14px]">
            {kpis.map(k => (
              <div key={k.l} className="bg-[#122036] border border-white/[0.06] rounded-[14px] p-[16px_18px]"
                style={{ borderTop: `3px solid ${k.c}` }}>
                <div className="font-mono text-[9.5px] tracking-[0.1em] text-[#6B7C92]">{k.l}</div>
                <div className="font-serif text-[23px] mt-1" style={{ color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Gráfico */}
          <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[22px_26px]">
            <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">ÚLTIMOS 7 DIAS</div>
            <h3 className="font-serif font-medium text-[19px] text-[#F4F6F9] mt-[5px] mb-[18px]">Vendas por dia</h3>
            <BarChart vendas={vendas} />
          </div>

          {/* Tabela */}
          <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] overflow-x-auto">
            <div style={{ minWidth: 920 }}>
              <div className="grid gap-3 px-6 py-4 font-mono text-[9.5px] tracking-[0.1em] text-[#4F6178] border-b border-white/[0.06]"
                style={{ gridTemplateColumns: '1.2fr 1.4fr 2fr 1.3fr .9fr 1fr .8fr 1fr' }}>
                <div>DATA</div><div>CLIENTE</div><div>PRODUTO</div><div>VENDEDOR</div>
                <div>CANAL</div><div className="text-right">VALOR</div>
                <div className="text-right">DESC.</div><div className="text-right">LUCRO</div>
              </div>
              {vendasFiltradas.length === 0 ? (
                <div className="text-center py-10 text-[#5C6E84] text-[13px]">Nenhuma venda no período.</div>
              ) : vendasFiltradas.map(v => (
                <div key={v.id} className="grid gap-3 px-6 py-[13px] border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] items-center"
                  style={{ gridTemplateColumns: '1.2fr 1.4fr 2fr 1.3fr .9fr 1fr .8fr 1fr' }}>
                  <div className="font-mono text-[11px] text-[#8A9BB0]">
                    {v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—'}
                  </div>
                  <div className="text-[12.5px] font-semibold text-[#E9EEF4] truncate">{v.cliente_nome ?? '—'}</div>
                  <div className="text-[12.5px] text-[#B7C2D0] truncate">{v.produto_nome ?? v.forma_pagamento ?? '—'}</div>
                  <div className="text-[12px] text-[#8A9BB0]">{v.vendedor_nome ?? '—'}</div>
                  <div>
                    <span className="px-[9px] py-[3px] rounded-[7px] text-[10.5px] font-semibold bg-white/[0.06] text-[#9FB0C2]">
                      {CANAL_LABEL[v.canal_venda ?? ''] ?? v.canal_venda ?? '—'}
                    </span>
                  </div>
                  <div className="text-right font-mono text-[12.5px] font-semibold text-[#F4F6F9]">{formatCurrency(v.valor_venda)}</div>
                  <div className="text-right font-mono text-[12px] text-[#F0656B]">
                    {v.desconto_valor ? formatCurrency(v.desconto_valor) : '—'}
                  </div>
                  <div className={cn('text-right font-mono text-[12.5px] font-bold',
                    (v.lucro ?? 0) > 0 ? 'text-[#34D399]' : 'text-[#F0656B]')}>
                    {v.lucro != null ? formatCurrency(v.lucro) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/* ── ABA ESTOQUE ── */}
        {aba === 'estoque' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
            <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">FLUXO FINANCEIRO</div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-[14px] mt-[5px]">
              <h3 className="font-serif font-medium text-[19px] text-[#F4F6F9]">
                Livro-caixa · {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="text-[12px] text-[#6B7C92]">
                Entradas <span className="text-[#34D399] font-bold">{formatCurrency(entradas)}</span>
                {' · '}Saídas <span className="text-[#F0656B] font-bold">{formatCurrency(saidas)}</span>
                {' · '}Saldo{' '}
                <span className={cn('font-bold', saldo >= 0 ? 'text-[#34D399]' : 'text-[#F0656B]')}>
                  {formatCurrency(saldo)}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 720 }}>
                <div className="grid gap-3 py-[14px] px-[6px] font-mono text-[9.5px] tracking-[0.12em] text-[#5C6E84] border-b border-white/[0.06]"
                  style={{ gridTemplateColumns: '.7fr 2.4fr 1.1fr .9fr 1.1fr 1fr' }}>
                  <div>DATA</div><div>DESCRIÇÃO</div><div>CATEGORIA</div>
                  <div>TIPO</div><div className="text-right">VALOR</div><div className="text-right">STATUS</div>
                </div>
                {lancMes.length === 0
                  ? <div className="text-center py-8 text-[#5C6E84] text-[13px]">Sem lançamentos este mês.</div>
                  : lancMes.map(l => {
                    const isReceit = l.tipo === 'receita'
                    const isPago   = l.status === 'pago'
                    return (
                      <div key={l.id} className="grid gap-3 py-[13px] px-[6px] items-center border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                        style={{ gridTemplateColumns: '.7fr 2.4fr 1.1fr .9fr 1.1fr 1fr' }}>
                        <div className="font-mono text-[11px] text-[#8A9BB0]">
                          {new Date(l.data_venc + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </div>
                        <div className="text-[13px] font-semibold text-[#E9EEF4] truncate">{l.descricao ?? '—'}</div>
                        <div className="text-[12px] text-[#8A9BB0]">{l.categoria ?? '—'}</div>
                        <div>
                          <span className="px-[9px] py-[3px] rounded-[7px] text-[10.5px] font-bold"
                            style={{ background: isReceit ? 'rgba(52,211,153,0.12)' : 'rgba(240,101,107,0.12)', color: isReceit ? '#34D399' : '#F0656B' }}>
                            {isReceit ? 'Entrada' : 'Saída'}
                          </span>
                        </div>
                        <div className={cn('text-right font-mono text-[13px] font-semibold', isReceit ? 'text-[#34D399]' : 'text-[#F0656B]')}>
                          {isReceit ? '+' : '−'} {formatCurrency(l.valor)}
                        </div>
                        <div className="text-right">
                          <span className="px-[9px] py-[3px] rounded-[7px] text-[10.5px] font-semibold"
                            style={{ background: isPago ? 'rgba(52,211,153,0.1)' : 'rgba(244,183,64,0.1)', color: isPago ? '#34D399' : '#F4B740' }}>
                            {isPago ? 'Pago' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ── ABA CLIENTES ── */}
        {aba === 'clientes' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px] flex items-center justify-center h-[200px]">
            <div className="text-center text-[#4F6178] font-mono text-[13px]">Relatório de clientes em construção</div>
          </div>
        )}

        {/* ── ABA EXPORTAR ── */}
        {aba === 'exportar' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
            <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">EXPORTAÇÕES</div>
            <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px] mb-6">Exportar dados</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Exportar Vendas',      sub: 'Todas as vendas do período filtrado',  action: () => exportCSV(vendas) },
                { label: 'Exportar Clientes',    sub: 'Lista completa de clientes', action: () => {} },
                { label: 'Exportar Estoque',     sub: 'Inventário atual',           action: () => {} },
                { label: 'Exportar Financeiro',  sub: 'Lançamentos financeiros',    action: () => {} },
              ].map(e => (
                <button key={e.label} onClick={e.action}
                  className="flex items-start gap-4 p-[18px_20px] bg-white/[0.03] border border-white/[0.08] rounded-[16px] hover:bg-white/[0.06] hover:border-[rgba(215,40,47,0.3)] transition-all text-left">
                  <Download size={22} className="text-[#F0656B] mt-[2px] flex-none" />
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#E9EEF4]">{e.label}</div>
                    <div className="text-[12px] text-[#6B7C92] mt-[3px]">{e.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
