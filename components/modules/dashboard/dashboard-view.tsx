'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { TrendingUp, TrendingDown, AlertTriangle, Package, Users, Zap } from 'lucide-react'
import { formatCurrency, formatRelativeTime, CANAIS_VENDA } from '@/lib/utils'
import { AnimatedCurrency, AnimatedInt } from '@/components/ui/animated-value'
import { AreaChart } from '@/components/ui/area-chart'
import { cn } from '@/lib/utils'

interface Kpis {
  receitaMes: number
  lucroMes: number
  qtdVendasMes: number
  ticketMedio: number
  totalClientes: number
  leadsAtivos: number
  leadsNovos: number
  estoqueDisponivel: number
  assistenciasAbertas: number
}

interface VendaRecente {
  id: number
  valor_venda: number
  forma_pagamento: string | null
  canal_venda: string | null
  data_venda: string | null
  status: string | null
}

interface DashboardData {
  kpis: Kpis
  vendasRecentes: VendaRecente[]
  leadsRecentes: Array<{
    id: number
    nome: string | null
    origem: string | null
    kanban_status: string | null
    created_at: string | null
    produto_interessado: string | null
    msgs_nao_lidas: number | null
  }>
}

interface PeriodKpis {
  receita: number
  lucro: number
  qtdVendas: number
  ticketMedio: number
}

const PERIOD_LABELS: Record<string, string> = {
  hoje: 'hoje',
  '7d': 'últimos 7 dias',
  '30d': 'últimos 30 dias',
  mes: 'este mês',
  ano: 'este ano',
}

function KpiCard({
  label,
  children,
  sub,
  delta,
  deltaUp,
  colorClass,
  delay = 0,
}: {
  label: string
  children: React.ReactNode
  sub?: string
  delta?: string
  deltaUp?: boolean
  colorClass?: string
  delay?: number
}) {
  return (
    <div
      className="bg-[#122036] border border-white/[0.06] rounded-[18px] p-[22px] relative overflow-hidden
                 transition-all duration-300 hover:-translate-y-[3px] hover:border-white/[0.18] animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex justify-between items-start">
        <div />
        {delta && (
          <span className={cn(
            'flex items-center gap-1 text-[12px] font-bold',
            deltaUp ? 'text-[#34D399]' : 'text-[#F0656B]'
          )}>
            {deltaUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {delta}
          </span>
        )}
      </div>
      <div className={cn('font-mono text-[10.5px] tracking-[0.12em] text-[#6B7C92] mt-[18px]', colorClass)}>
        {label}
      </div>
      <div className="font-serif font-medium text-[30px] tracking-[-0.02em] text-[#F4F6F9] mt-1">
        {children}
      </div>
      {sub && <div className="text-[12px] text-[#5C6E84] mt-1">{sub}</div>}
    </div>
  )
}


// ── Donut simples de vendas por canal ──
const CANAL_COLORS: Record<string, { color: string; label: string }> = {
  whatsapp:    { color: '#34D399', label: 'WhatsApp' },
  instagram:   { color: '#F0454D', label: 'Instagram' },
  loja_fisica: { color: '#AEB8C6', label: 'Loja física' },
  site:        { color: '#7FB0E8', label: 'Site' },
}

function DonutCanais({ vendasRecentes }: { vendasRecentes: Array<{ canal_venda: string | null }> }) {
  // Conta por canal
  const counts: Record<string, number> = {}
  vendasRecentes.forEach(v => {
    const canal = v.canal_venda ?? 'loja_fisica'
    counts[canal] = (counts[canal] ?? 0) + 1
  })
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (total === 0) {
    return (
      <div className="text-center py-8 text-[#5C6E84] text-[13px]">
        Sem dados de canal ainda.
      </div>
    )
  }

  const segs = Object.entries(counts).map(([canal, count]) => ({
    canal,
    count,
    pct: Math.round((count / total) * 100),
    color: CANAL_COLORS[canal]?.color ?? '#6B7C92',
    label: CANAL_COLORS[canal]?.label ?? canal,
  }))

  // SVG donut
  const R = 52, cx = 70, cy = 70
  const C = 2 * Math.PI * R
  let offset = 0
  const rings = segs.map((s, i) => {
    const len = C * s.pct / 100
    const el = (
      <circle
        key={i} cx={cx} cy={cy} r={R}
        fill="none" stroke={s.color} strokeWidth={15}
        strokeDasharray={`${len} ${C - len}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    )
    offset += len
    return el
  })

  return (
    <div className="flex items-center gap-[18px]">
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flex: 'none' }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={15} />
        {rings}
        <text x={cx} y={cy - 3} textAnchor="middle" fill="#F4F6F9" fontSize={23}
          fontFamily="Fraunces, serif" fontWeight={600}>{total}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" fill="#5C6E84" fontSize={9}
          fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">VENDAS</text>
      </svg>
      <div className="flex flex-col gap-[13px] flex-1">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-[10px]">
            <span className="w-[9px] h-[9px] rounded-[3px] flex-none" style={{ background: s.color }} />
            <span className="text-[13px] text-[#9FB0C2] flex-1">{s.label}</span>
            <span className="text-[13px] text-[#EEF2F7] font-bold font-mono">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardView({ data: initialData }: { data: DashboardData }) {
  const [activePeriod, setActivePeriod] = useState('mes')
  const [periodsData, setPeriodsData] = useState<Record<string, PeriodKpis> | null>(null)
  const [faturamentoMensal, setFaturamentoMensal] = useState<Array<{ mes: string; total: number }>>([])
  const [globais, setGlobais] = useState({
    totalClientes: initialData.kpis.totalClientes,
    leadsAtivos: initialData.kpis.leadsAtivos,
    leadsNovos: initialData.kpis.leadsNovos,
    estoqueDisponivel: initialData.kpis.estoqueDisponivel,
    assistenciasAbertas: initialData.kpis.assistenciasAbertas,
  })
  const [vendasRecentes, setVendasRecentes] = useState<VendaRecente[]>(initialData.vendasRecentes)

  // Carrega todos os períodos UMA vez ao montar
  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled || !json) return
        setPeriodsData(json.periods)
        setGlobais(json.globais)
        setVendasRecentes(json.vendasRecentes)
        if (json.faturamentoMensal) setFaturamentoMensal(json.faturamentoMensal)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // KPIs do período ativo — troca INSTANTÂNEA (já em memória)
  const cur = periodsData?.[activePeriod]
  const receita = cur?.receita ?? initialData.kpis.receitaMes
  const lucro = cur?.lucro ?? initialData.kpis.lucroMes
  const qtdVendas = cur?.qtdVendas ?? initialData.kpis.qtdVendasMes
  const ticketMedio = cur?.ticketMedio ?? initialData.kpis.ticketMedio

  const margem = receita > 0 ? Math.round((lucro / receita) * 100) : 0
  const periodLabel = PERIOD_LABELS[activePeriod] ?? 'este mês'

  const funnelData = [
    { label: 'Novo', count: globais.leadsNovos, color: '#F0656B', pct: globais.leadsAtivos > 0 ? Math.round((globais.leadsNovos / globais.leadsAtivos) * 100) : 0 },
    { label: 'Em contato', count: globais.leadsAtivos - globais.leadsNovos, color: '#7FB0E8', pct: globais.leadsAtivos > 0 ? Math.round(((globais.leadsAtivos - globais.leadsNovos) / globais.leadsAtivos) * 100) : 0 },
    { label: 'Proposta', count: 0, color: '#C6A86A', pct: 0 },
    { label: 'Negociação', count: 0, color: '#F4B740', pct: 0 },
    { label: 'Convertido', count: 0, color: '#34D399', pct: 0 },
  ]

  return (
    <>
      <Topbar
        eyebrow="PAINEL · JM STORE IMPORTADOS"
        title="Visão geral"
        showPeriods
        activePeriod={activePeriod}
        onPeriodChange={setActivePeriod}
      />
      <main className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
        <div className="max-w-[1320px] mx-auto space-y-5">

          {/* ── HERO ── */}
          <section className="relative overflow-hidden rounded-[24px] p-[36px_40px] bg-hero-gradient border border-white/[0.08] shadow-[0_28px_70px_rgba(0,0,0,0.45)] animate-fade-up">
            <div className="absolute right-[42px] top-[36px] flex items-center gap-2 px-[13px] py-[7px] rounded-full bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.25)]">
              <span className="w-[7px] h-[7px] rounded-full bg-[#34D399] shadow-[0_0_0_0_rgba(52,211,153,0.5)] animate-[pulseDot_2.2s_ease-in-out_infinite]" />
              <span className="font-mono text-[10.5px] tracking-[0.1em] text-[#5FE3B5]">SISTEMA ONLINE</span>
            </div>

            <div className="relative z-10 max-w-[620px]">
              <div className="font-mono text-[11px] tracking-[0.16em] text-[#C9D3DF]/70 uppercase">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}
              </div>
              <h2 className="mt-2 font-serif font-normal text-[34px] leading-[1.12] tracking-[-0.025em] text-[#F6F8FB]">
                Boa gestão gera bons resultados. A operação está{' '}
                <em className="italic text-[#F0656B]">voando alto</em>.
              </h2>

              <div className="flex items-end gap-[18px] mt-[26px]">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.18em] text-[#7E8EA2]">FATURAMENTO · {periodLabel.toUpperCase()}</div>
                  <AnimatedCurrency
                    value={receita}
                    className="block font-serif font-medium text-[52px] leading-none tracking-[-0.03em] text-white mt-1.5"
                  />
                </div>
                <div className="flex items-center gap-1.5 px-[11px] py-[5px] rounded-full bg-[rgba(52,211,153,0.14)] mb-2">
                  <TrendingUp size={15} className="text-[#34D399]" />
                  <span className="text-[13px] font-bold text-[#34D399]">
                    <AnimatedInt value={qtdVendas} /> vendas
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-7">
                <button className="flex items-center gap-2 px-5 py-3 rounded-[12px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[14px] shadow-[0_8px_24px_rgba(215,40,47,0.38)] hover:-translate-y-[2px] hover:shadow-[0_12px_30px_rgba(215,40,47,0.5)] transition-all">
                  <Zap size={18} />
                  Nova venda
                </button>
                <button className="flex items-center gap-2 px-5 py-3 rounded-[12px] bg-white/[0.06] border border-white/[0.14] text-[#E3E9F0] font-semibold text-[14px] hover:bg-white/[0.12] transition-colors">
                  <Package size={18} />
                  Ver estoque
                </button>
              </div>
            </div>
          </section>

          {/* ── KPI GRID ── */}
          <div className="grid grid-cols-4 gap-[18px]">
            <KpiCard label="VENDAS TOTAIS" sub={periodLabel} delta="+18,2%" deltaUp delay={50}>
              <AnimatedCurrency value={receita} />
            </KpiCard>
            <KpiCard label="LUCRO BRUTO" sub={`margem de ${margem}%`} delta="+12,4%" deltaUp delay={120}>
              <AnimatedCurrency value={lucro} />
            </KpiCard>
            <KpiCard label="TICKET MÉDIO" sub="por venda fechada" delta="+5,1%" deltaUp delay={190}>
              <AnimatedCurrency value={ticketMedio} />
            </KpiCard>
            <KpiCard label="VENDAS FECHADAS" sub="no período" delta="+8,3%" deltaUp delay={260}>
              <AnimatedInt value={qtdVendas} />
            </KpiCard>
          </div>

          {/* ── STRIP ── */}
          <div className="grid grid-cols-4 gap-[18px]">
            {[
              { icon: Package, color: '#F4B740', val: `${globais.estoqueDisponivel} un`, sub: 'disponíveis em estoque', alert: globais.estoqueDisponivel < 5 },
              { icon: Users, color: '#7FB0E8', val: String(globais.totalClientes), sub: 'clientes cadastrados', alert: false },
              { icon: AlertTriangle, color: '#C4CCD6', val: String(globais.assistenciasAbertas), sub: 'assistências abertas', alert: globais.assistenciasAbertas > 0 },
              { icon: TrendingUp, color: '#F0656B', val: String(globais.leadsAtivos), sub: 'leads ativos no funil', alert: globais.leadsNovos > 20 },
            ].map(({ icon: Icon, color, val, sub, alert }, i) => (
              <div key={i} className={cn(
                'bg-white/[0.025] border rounded-[16px] p-[16px_18px] flex items-center gap-[14px]',
                alert ? 'border-[rgba(240,100,107,0.25)]' : 'border-white/[0.05]'
              )}>
                <Icon size={30} style={{ color }} />
                <div>
                  <div className="font-serif text-[20px] text-[#EEF2F7]">{val}</div>
                  <div className="text-[11.5px] text-[#5C6E84] mt-[1px]">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── CHARTS ROW A: Gráfico área + Donut ── */}
          <div className="grid gap-[18px]" style={{ gridTemplateColumns: '1.85fr 1fr' }}>

            {/* Tendência de faturamento */}
            <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '350ms' }}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">DESEMPENHO</div>
                  <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px]">Tendência de faturamento</h3>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] font-mono text-[10.5px] text-[#9FB0C2]">
                  12 MESES
                </div>
              </div>
              <AreaChart data={faturamentoMensal} />
            </div>

            {/* Vendas por canal (donut simples) */}
            <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '420ms' }}>
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">ORIGEM</div>
              <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px] mb-[22px]">Vendas por canal</h3>
              <DonutCanais vendasRecentes={vendasRecentes} />
            </div>
          </div>

          {/* ── CHARTS ROW B: Funil + Vendas recentes ── */}
          <div className="grid grid-cols-[1fr_1.1fr] gap-[18px]">

            {/* Funil */}
            <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">CONVERSÃO</div>
              <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px] mb-5">Funil de leads</h3>
              <div className="space-y-3">
                {funnelData.map(({ label, count, color, pct }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[12.5px] text-[#8A9BB0] w-[90px] shrink-0">{label}</span>
                    <div className="flex-1 h-[22px] bg-white/[0.05] rounded-[6px] overflow-hidden">
                      <div
                        className="h-full rounded-[6px] flex items-center pl-2.5 animate-grow-x"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: `${color}38` }}
                      >
                        {pct > 8 && (
                          <span className="font-mono text-[10px] font-semibold text-white/80">{pct}%</span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-[12px] font-semibold text-[#F4F6F9] w-7 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Vendas recentes */}
            <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
              <div className="flex justify-between items-center mb-[18px]">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">TEMPO REAL</div>
                  <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px]">Últimas vendas</h3>
                </div>
                <button className="text-[12.5px] text-[#9FB0C2] hover:text-[#F4F6F9] font-semibold transition-colors">
                  Ver todas →
                </button>
              </div>

              {vendasRecentes.length === 0 ? (
                <div className="text-center py-8 text-[#5C6E84] text-[13px]">
                  Nenhuma venda este mês ainda.
                </div>
              ) : (
                <div className="space-y-0">
                  {vendasRecentes.map((venda, i) => {
                    const canal = CANAIS_VENDA.find(c => c.value === venda.canal_venda)
                    const avatarColors = ['#34D399', '#7FB0E8', '#D7282F', '#F4B740', '#C6A86A']
                    const bg = avatarColors[i % avatarColors.length]
                    return (
                      <div key={venda.id} className="flex items-center gap-3 py-[13px] border-b border-white/[0.04] last:border-0">
                        <div
                          className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center font-bold text-[12px] text-white shrink-0"
                          style={{ background: `linear-gradient(135deg, ${bg}40, ${bg}20)`, border: `1px solid ${bg}30`, color: bg }}
                        >
                          V{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-[#E9EEF4]">
                            {venda.forma_pagamento ?? 'Pix'}
                          </div>
                          <div className="text-[11px] text-[#6B7C92]">
                            {canal?.label ?? 'Loja física'} · {formatRelativeTime(venda.data_venda)}
                          </div>
                        </div>
                        <div className="font-serif text-[16px] text-[#F4F6F9]">
                          {formatCurrency(venda.valor_venda)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── ALERTAS ── */}
          {(globais.estoqueDisponivel < 5 || globais.leadsNovos > 20) && (
            <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">ATENÇÃO</div>
              <h3 className="font-serif font-medium text-[19px] text-[#F4F6F9] mt-[5px] mb-[18px]">Alertas</h3>
              <div className="space-y-3">
                {globais.estoqueDisponivel < 5 && (
                  <div className="flex gap-3 items-start p-3 rounded-[13px] bg-[rgba(215,40,47,0.1)] cursor-pointer hover:translate-x-[3px] transition-transform">
                    <Package size={24} className="text-[#F0656B] shrink-0" />
                    <div>
                      <div className="text-[13.5px] font-semibold text-[#EAEFF5]">Estoque crítico</div>
                      <div className="text-[11.5px] text-[#8A9BB0] mt-0.5 leading-[1.4]">
                        Apenas {globais.estoqueDisponivel} unidade{globais.estoqueDisponivel !== 1 ? 's' : ''} disponível — reposição urgente necessária
                      </div>
                    </div>
                  </div>
                )}
                {globais.leadsNovos > 20 && (
                  <div className="flex gap-3 items-start p-3 rounded-[13px] bg-[rgba(244,183,64,0.08)] cursor-pointer hover:translate-x-[3px] transition-transform">
                    <Users size={24} className="text-[#F4B740] shrink-0" />
                    <div>
                      <div className="text-[13.5px] font-semibold text-[#EAEFF5]">{globais.leadsNovos} leads sem tratativa</div>
                      <div className="text-[11.5px] text-[#8A9BB0] mt-0.5 leading-[1.4]">
                        Leads acumulados aguardando primeiro contato no funil
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  )
}
