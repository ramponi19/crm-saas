'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Users, Package, Wrench, BarChart3, PieChart, Activity } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface Venda {
  valor_venda: number
  data_venda: string | null
  forma_pagamento: string | null
  canal_venda: string | null
  status: string | null
  lucro_bruto: number | null
}

interface Lancamento {
  tipo: string
  valor: number
  data_venc: string
  status: string
  categoria: string | null
}

interface Lead {
  status: string
  created_at: string
}

interface EstoqueItem {
  preco_venda: number | null
  preco_custo: number | null
  status: string
}

interface OS {
  orcamento_valor: number | null
  status: string
  data_entrada: string
}

interface Props {
  vendas: Venda[]
  lancamentos: Lancamento[]
  leads: Lead[]
  estoque: EstoqueItem[]
  ordensServico: OS[]
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CANAL_LABEL: Record<string,string> = {
  loja_fisica:'Loja física', whatsapp:'WhatsApp', instagram:'Instagram',
  marketplace:'Marketplace', indicacao:'Indicação',
}

const PGTO_LABEL: Record<string,string> = {
  pix:'Pix', dinheiro:'Dinheiro', credito:'Crédito', debito:'Débito',
  transferencia:'Transferência', fiado:'Fiado',
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="w-full bg-white/[0.04] rounded-full h-2 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

export function RelatoriosView({ vendas, lancamentos, leads, estoque, ordensServico }: Props) {
  const [aba, setAba] = useState<'vendas' | 'financeiro' | 'canais' | 'leads'>('vendas')

  // ── Vendas por mês
  const vendasPorMes = useMemo(() => {
    const map: Record<number, { receita: number; lucro: number; qtd: number }> = {}
    for (let i = 0; i < 12; i++) map[i] = { receita: 0, lucro: 0, qtd: 0 }
    vendas.forEach(v => {
      if (!v.data_venda) return
      const mes = new Date(v.data_venda).getMonth()
      map[mes].receita += v.valor_venda
      map[mes].lucro   += v.lucro_bruto ?? 0
      map[mes].qtd     += 1
    })
    return Object.entries(map).map(([m, d]) => ({ mes: MESES[Number(m)], ...d }))
  }, [vendas])

  const maxReceita = Math.max(...vendasPorMes.map(m => m.receita), 1)

  // ── Lancamentos pagos por mês
  const lancPorMes = useMemo(() => {
    const map: Record<number, { receitas: number; despesas: number }> = {}
    for (let i = 0; i < 12; i++) map[i] = { receitas: 0, despesas: 0 }
    lancamentos.filter(l => l.status === 'pago').forEach(l => {
      const mes = new Date(l.data_venc + 'T00:00:00').getMonth()
      if (l.tipo === 'receita') map[mes].receitas += l.valor
      else map[mes].despesas += l.valor
    })
    return Object.entries(map).map(([m, d]) => ({ mes: MESES[Number(m)], ...d, saldo: d.receitas - d.despesas }))
  }, [lancamentos])

  const maxLanc = Math.max(...lancPorMes.map(m => Math.max(m.receitas, m.despesas)), 1)

  // ── Por canal
  const porCanal = useMemo(() => {
    const map: Record<string, number> = {}
    vendas.forEach(v => {
      const k = v.canal_venda ?? 'outros'
      map[k] = (map[k] ?? 0) + v.valor_venda
    })
    const total = Object.values(map).reduce((s,v) => s+v, 0)
    return Object.entries(map)
      .sort((a,b) => b[1]-a[1])
      .map(([canal, valor]) => ({ canal, valor, pct: total > 0 ? (valor/total)*100 : 0 }))
  }, [vendas])

  // ── Por forma pgto
  const porPgto = useMemo(() => {
    const map: Record<string, number> = {}
    vendas.forEach(v => {
      const k = v.forma_pagamento ?? 'outros'
      map[k] = (map[k] ?? 0) + v.valor_venda
    })
    const total = Object.values(map).reduce((s,v) => s+v, 0)
    return Object.entries(map)
      .sort((a,b) => b[1]-a[1])
      .map(([pgto, valor]) => ({ pgto, valor, pct: total > 0 ? (valor/total)*100 : 0 }))
  }, [vendas])

  // ── Leads por status
  const leadsPorStatus = useMemo(() => {
    const map: Record<string, number> = {}
    leads.forEach(l => { map[l.status] = (map[l.status] ?? 0) + 1 })
    return Object.entries(map).sort((a,b) => b[1]-a[1])
  }, [leads])

  const totalLeads = leads.length
  const leadsConvertidos = leads.filter(l => l.status === 'convertido').length
  const taxaConversao = totalLeads > 0 ? (leadsConvertidos / totalLeads) * 100 : 0

  // ── KPIs gerais
  const totalReceita = vendas.reduce((s,v) => s + v.valor_venda, 0)
  const totalLucro   = vendas.reduce((s,v) => s + (v.lucro_bruto ?? 0), 0)
  const ticketMedio  = vendas.length > 0 ? totalReceita / vendas.length : 0
  const valorEstoque = estoque.reduce((s,e) => s + (e.preco_venda ?? 0), 0)
  const custoEstoque = estoque.reduce((s,e) => s + (e.preco_custo ?? 0), 0)
  const osReceita    = ordensServico.filter(o => o.status === 'concluida').reduce((s,o) => s + (o.orcamento_valor ?? 0), 0)

  const CANAL_COLORS = ['#6B8CFF','#34D399','#F59E0B','#F0353D','#EC4899','#8B5CF6']

  return (
    <div className="p-8 space-y-7">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Receita total (ano)', value: formatCurrency(totalReceita), sub: `${vendas.length} vendas`, icon: TrendingUp, color: '#34D399' },
          { label: 'Lucro bruto (ano)',   value: formatCurrency(totalLucro),   sub: `${totalLucro > 0 ? ((totalLucro/totalReceita)*100).toFixed(1) : 0}% margem`, icon: Activity, color: '#6B8CFF' },
          { label: 'Ticket médio',        value: formatCurrency(ticketMedio),  sub: 'por venda', icon: BarChart3, color: '#F59E0B' },
          { label: 'Estoque disponível',  value: formatCurrency(valorEstoque), sub: `${estoque.length} itens`, icon: Package, color: '#F0353D' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="text-[11px] text-[#5C6E84] font-mono tracking-wider uppercase">{k.label}</div>
                <Icon size={16} style={{ color: k.color }} />
              </div>
              <div className="text-xl font-semibold text-[#F4F6F9]">{k.value}</div>
              <div className="text-xs text-[#5C6E84] mt-1">{k.sub}</div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#0A111E] border border-white/[0.06] rounded-[12px] p-1 w-fit">
        {([
          { id: 'vendas',     label: 'Vendas / mês' },
          { id: 'financeiro', label: 'Fluxo financeiro' },
          { id: 'canais',     label: 'Canais & Pagamentos' },
          { id: 'leads',      label: 'Leads & Conversão' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={cn(
              'px-4 py-2 rounded-[9px] text-sm font-semibold transition-all',
              aba === t.id ? 'bg-[#1A2A3F] text-[#D4DEEA]' : 'text-[#5C6E84] hover:text-[#8A9BB0]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo por aba */}
      {aba === 'vendas' && (
        <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-6">
          <h3 className="text-sm font-semibold text-[#D4DEEA] mb-6">Receita mensal — {new Date().getFullYear()}</h3>
          <div className="grid grid-cols-12 gap-2 items-end h-48">
            {vendasPorMes.map((m) => {
              const h = maxReceita > 0 ? (m.receita / maxReceita) * 100 : 0
              return (
                <div key={m.mes} className="flex flex-col items-center gap-1 group">
                  <div className="w-full relative flex flex-col justify-end" style={{ height: '160px' }}>
                    <div
                      className="w-full rounded-t-[6px] bg-gradient-to-t from-[#D7282F] to-[#6B8CFF] transition-all duration-500 relative group-hover:opacity-90"
                      style={{ height: `${Math.max(h, 2)}%` }}
                    >
                      {m.receita > 0 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-[#8A9BB0] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                          {formatCurrency(m.receita)}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-[#3F516A] font-mono">{m.mes}</span>
                  {m.qtd > 0 && <span className="text-[9px] text-[#3F516A]">{m.qtd}v</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {aba === 'financeiro' && (
        <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-6">
          <h3 className="text-sm font-semibold text-[#D4DEEA] mb-6">Receitas vs Despesas — {new Date().getFullYear()}</h3>
          <div className="space-y-3">
            {lancPorMes.map(m => (
              <div key={m.mes} className="grid grid-cols-[40px_1fr_1fr_80px] items-center gap-4">
                <span className="text-xs text-[#5C6E84] font-mono">{m.mes}</span>
                <div>
                  <Bar value={m.receitas} max={maxLanc} color="#34D399" />
                </div>
                <div>
                  <Bar value={m.despesas} max={maxLanc} color="#F0353D" />
                </div>
                <span className={cn('text-xs font-semibold text-right', m.saldo >= 0 ? 'text-[#34D399]' : 'text-[#F0353D]')}>
                  {m.saldo >= 0 ? '+' : ''}{formatCurrency(m.saldo)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.06]">
            <span className="flex items-center gap-1.5 text-xs text-[#5C6E84]"><span className="w-3 h-2 rounded-sm bg-[#34D399]" />Receitas</span>
            <span className="flex items-center gap-1.5 text-xs text-[#5C6E84]"><span className="w-3 h-2 rounded-sm bg-[#F0353D]" />Despesas</span>
          </div>
        </div>
      )}

      {aba === 'canais' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-6">
            <h3 className="text-sm font-semibold text-[#D4DEEA] mb-5">Vendas por canal</h3>
            <div className="space-y-3">
              {porCanal.length === 0 ? (
                <p className="text-sm text-[#3F516A]">Sem dados</p>
              ) : porCanal.map((c, i) => (
                <div key={c.canal} className="space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#D4DEEA]">{CANAL_LABEL[c.canal] ?? c.canal}</span>
                    <span className="text-xs text-[#8A9BB0]">{formatCurrency(c.valor)} · {c.pct.toFixed(1)}%</span>
                  </div>
                  <Bar value={c.pct} max={100} color={CANAL_COLORS[i % CANAL_COLORS.length]} />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-6">
            <h3 className="text-sm font-semibold text-[#D4DEEA] mb-5">Formas de pagamento</h3>
            <div className="space-y-3">
              {porPgto.length === 0 ? (
                <p className="text-sm text-[#3F516A]">Sem dados</p>
              ) : porPgto.map((p, i) => (
                <div key={p.pgto} className="space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#D4DEEA]">{PGTO_LABEL[p.pgto] ?? p.pgto}</span>
                    <span className="text-xs text-[#8A9BB0]">{formatCurrency(p.valor)} · {p.pct.toFixed(1)}%</span>
                  </div>
                  <Bar value={p.pct} max={100} color={CANAL_COLORS[i % CANAL_COLORS.length]} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {aba === 'leads' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Taxa conversão */}
          <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-6">
            <h3 className="text-sm font-semibold text-[#D4DEEA] mb-5">Funil de conversão</h3>
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold text-[#6B8CFF]">{taxaConversao.toFixed(1)}%</div>
                <div className="text-sm text-[#5C6E84] mt-1">taxa de conversão</div>
                <div className="text-xs text-[#3F516A] mt-0.5">{leadsConvertidos} de {totalLeads} leads</div>
              </div>
              <div className="space-y-2">
                {leadsPorStatus.map(([status, qtd]) => (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm capitalize text-[#D4DEEA]">{status}</span>
                      <span className="text-xs text-[#8A9BB0]">{qtd} leads</span>
                    </div>
                    <Bar value={qtd} max={totalLeads} color={
                      status === 'convertido' ? '#34D399' :
                      status === 'perdido' ? '#F0353D' :
                      status === 'negociacao' ? '#F59E0B' : '#6B8CFF'
                    } />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Assistência */}
          <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-6">
            <h3 className="text-sm font-semibold text-[#D4DEEA] mb-5">Assistência técnica</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Receita OS (ano)',   value: formatCurrency(osReceita), color: '#34D399' },
                  { label: 'Total OS',           value: String(ordensServico.length), color: '#6B8CFF' },
                  { label: 'Valor em estoque',   value: formatCurrency(valorEstoque), color: '#F59E0B' },
                  { label: 'Custo do estoque',   value: formatCurrency(custoEstoque), color: '#F0353D' },
                ].map(k => (
                  <div key={k.label} className="bg-[#0A111E] rounded-[12px] p-3">
                    <div className="text-[10px] text-[#3F516A] font-mono uppercase tracking-wider mb-1">{k.label}</div>
                    <div className="text-lg font-semibold" style={{ color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs text-[#5C6E84] mb-2">Status das OS</div>
                <div className="space-y-1.5">
                  {[
                    { s: 'aguardando', label: 'Aguardando', color: '#F59E0B' },
                    { s: 'em_andamento', label: 'Em andamento', color: '#6B8CFF' },
                    { s: 'concluida', label: 'Concluída', color: '#34D399' },
                    { s: 'cancelada', label: 'Cancelada', color: '#5C6E84' },
                  ].map(({ s, label, color }) => {
                    const qtd = ordensServico.filter(o => o.status === s).length
                    return (
                      <div key={s} className="flex items-center gap-3">
                        <span className="text-xs text-[#8A9BB0] w-24">{label}</span>
                        <div className="flex-1">
                          <Bar value={qtd} max={Math.max(ordensServico.length, 1)} color={color} />
                        </div>
                        <span className="text-xs font-mono text-[#5C6E84] w-6 text-right">{qtd}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
