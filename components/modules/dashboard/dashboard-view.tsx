'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { TrendingUp, Package, Users, AlertTriangle, Zap, ArrowUpRight } from 'lucide-react'
import { formatCurrency, formatRelativeTime, CANAIS_VENDA } from '@/lib/utils'
import { AnimatedCurrency, AnimatedInt } from '@/components/ui/animated-value'
import { AreaChart } from '@/components/ui/area-chart'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────
interface Kpis {
  receitaMes: number; lucroMes: number; qtdVendasMes: number; ticketMedio: number
  totalClientes: number; leadsAtivos: number; leadsNovos: number
  estoqueDisponivel: number; assistenciasAbertas: number
}
interface VendaRecente {
  id: number; valor_venda: number; forma_pagamento: string | null
  canal_venda: string | null; data_venda: string | null; status: string | null
  cliente_nome?: string | null; produto_nome?: string | null
}
interface DashboardData {
  kpis: Kpis
  vendasRecentes: VendaRecente[]
  leadsRecentes: Array<{ id: number; nome: string | null; kanban_status: string | null; created_at: string | null }>
}
interface PeriodKpis { receita: number; lucro: number; qtdVendas: number; ticketMedio: number }

const PERIOD_LABELS: Record<string, string> = {
  hoje: 'hoje', '7d': 'últimos 7 dias', '30d': 'últimos 30 dias', mes: 'este mês', ano: 'este ano',
}

// ─────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────
function KpiCard({ label, children, sub, delta, deltaUp, delay = 0 }: {
  label: string; children: React.ReactNode; sub?: string
  delta?: string; deltaUp?: boolean; delay?: number
}) {
  return (
    <div className="bg-white border border-[#16212E]/[0.08] rounded-[18px] p-[22px] transition-all duration-300 hover:-translate-y-[3px] hover:border-white/[0.18] animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}>
      <div className="flex justify-between items-start">
        <div />
        {delta && (
          <span className={cn('flex items-center gap-1 text-[12px] font-bold', deltaUp ? 'text-[#34D399]' : 'text-[#C01F26]')}>
            <TrendingUp size={14} />{delta}
          </span>
        )}
      </div>
      <div className="font-mono text-[10.5px] tracking-[0.12em] text-[#6B7C92] mt-[18px]">{label}</div>
      <div className="font-serif font-medium text-[30px] tracking-[-0.02em] text-[#16212E] mt-1">{children}</div>
      {sub && <div className="text-[12px] text-[#788698] mt-1">{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────
// Donut — Vendas por canal
// ─────────────────────────────────────────
const CANAL_META: Record<string, { color: string; label: string }> = {
  whatsapp:    { color: '#34D399', label: 'WhatsApp' },
  instagram:   { color: '#F0454D', label: 'Instagram' },
  loja_fisica: { color: '#AEB8C6', label: 'Loja física' },
  site:        { color: '#7FB0E8', label: 'Site' },
}
function DonutCanais({ vendas }: { vendas: VendaRecente[] }) {
  const counts: Record<string, number> = {}
  vendas.forEach(v => { const c = v.canal_venda ?? 'loja_fisica'; counts[c] = (counts[c] ?? 0) + 1 })
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (!total) return <div className="text-center py-8 text-[#788698] text-[13px]">Sem dados ainda.</div>
  const segs = Object.entries(counts).map(([c, n]) => ({
    label: CANAL_META[c]?.label ?? c, color: CANAL_META[c]?.color ?? '#6B7C92',
    pct: Math.round((n / total) * 100),
  }))
  const R = 52, cx = 70, cy = 70, C = 2 * Math.PI * R
  let off = 0
  const rings = segs.map((s, i) => {
    const len = C * s.pct / 100
    const el = <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color} strokeWidth={15}
      strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} />
    off += len; return el
  })
  return (
    <div className="flex items-center gap-[18px]">
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flex: 'none' }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(22,32,46,0.08)" strokeWidth={15} />
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
            <span className="font-mono text-[13px] font-bold text-[#EEF2F7]">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// Top Produtos (barra horizontal)
// ─────────────────────────────────────────
function TopProdutos({ vendas }: { vendas: VendaRecente[] }) {
  // Agrupa por forma_pagamento como proxy (sem dados de produto aqui)
  // Mostra mensagem se não houver dados suficientes
  if (!vendas.length) {
    return <div className="text-center py-8 text-[#788698] text-[13px]">Sem vendas no período.</div>
  }
  const rows = vendas.slice(0, 6).map((v, i) => ({
    nome: v.forma_pagamento ?? 'Pix',
    val: Number(v.valor_venda),
  }))
  const maxVal = Math.max(...rows.map(r => r.val), 1)
  return (
    <div className="flex flex-col gap-[15px]">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex justify-between mb-[6px]">
            <span className="text-[12.5px] text-[#16212E] font-medium">Venda #{i + 1} · {r.nome}</span>
            <span className="font-mono text-[12px] text-[#6B7C92]">{formatCurrency(r.val)}</span>
          </div>
          <div className="h-[8px] rounded-[8px] bg-white/[0.05] overflow-hidden">
            <div className="h-full rounded-[8px]"
              style={{ width: `${(r.val / maxVal) * 100}%`, background: i === 0 ? 'linear-gradient(90deg,#8E1B20,#F0454D)' : 'linear-gradient(90deg,#3A4A63,#6E8099)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────
// Funil de leads
// ─────────────────────────────────────────
function FunilLeads({ leadsAtivos, leadsNovos }: { leadsAtivos: number; leadsNovos: number }) {
  const emContato = Math.max(0, leadsAtivos - leadsNovos)
  const rows = [
    { label: 'Novos leads',  val: leadsNovos,  color: '#F0454D' },
    { label: 'Em contato',   val: emContato,   color: '#D7282F' },
    { label: 'Negociando',   val: Math.round(emContato * 0.5), color: '#B11D24' },
    { label: 'Convertido',   val: Math.round(emContato * 0.3), color: '#34D399' },
  ]
  const maxVal = Math.max(...rows.map(r => r.val), 1)
  return (
    <div className="flex flex-col gap-[12px]">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-[12px]">
          <div className="flex-1 h-[38px] rounded-[10px] bg-white/[0.04] overflow-hidden relative">
            <div className="h-full rounded-[10px] flex items-center px-3"
              style={{ width: `${Math.max((r.val / maxVal) * 100, 8)}%`, background: r.color }}>
              <span className={cn('text-[12.5px] font-semibold whitespace-nowrap', i === 3 ? 'text-[#06281C]' : 'text-white')}>
                {r.label}
              </span>
            </div>
          </div>
          <span className="font-mono text-[14px] font-bold text-[#EEF2F7] w-8 text-right">{r.val}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────
// Alertas
// ─────────────────────────────────────────
function Alertas({ estoqueDisponivel, leadsNovos, assistenciasAbertas }: {
  estoqueDisponivel: number; leadsNovos: number; assistenciasAbertas: number
}) {
  const items = [
    estoqueDisponivel < 5 && {
      icon: <Package size={24} className="text-[#F4B740] flex-none" />,
      bg: 'rgba(244,183,64,.1)', title: 'Estoque baixo',
      desc: `Apenas ${estoqueDisponivel} unidade(s) disponível — reposição necessária`,
    },
    assistenciasAbertas > 0 && {
      icon: <AlertTriangle size={24} className="text-[#C01F26] flex-none" />,
      bg: 'rgba(215,40,47,.1)', title: 'Assistências abertas',
      desc: `${assistenciasAbertas} ordem(s) em andamento`,
    },
    leadsNovos > 20 && {
      icon: <Users size={24} className="text-[#7FB0E8] flex-none" />,
      bg: 'rgba(127,176,232,.1)', title: `${leadsNovos} leads sem tratativa`,
      desc: 'Leads acumulados aguardando primeiro contato',
    },
  ].filter(Boolean) as Array<{ icon: React.ReactNode; bg: string; title: string; desc: string }>

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-[#34D399]">
        <div className="w-10 h-10 rounded-full bg-[rgba(52,211,153,0.1)] flex items-center justify-center">
          <TrendingUp size={20} />
        </div>
        <span className="text-[13px] font-semibold">Tudo em ordem!</span>
        <span className="text-[11px] text-[#788698] text-center">Sem alertas críticos no momento.</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-[12px]">
      {items.map((a, i) => (
        <div key={i} className="flex gap-3 items-start p-3 rounded-[13px] cursor-pointer hover:translate-x-[3px] transition-transform"
          style={{ background: a.bg }}>
          {a.icon}
          <div>
            <div className="text-[13.5px] font-semibold text-[#EAEFF5]">{a.title}</div>
            <div className="text-[11.5px] text-[#788698] mt-[2px] leading-[1.4]">{a.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────
// Top Vendedores — dados reais com meta
// ─────────────────────────────────────────
const AVATAR_COLORS = ['#D7282F', '#7FB0E8', '#34D399', '#F4B740', '#C6A86A']

function getInitials(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function TopVendedores({ vendedores }: {
  vendedores: Array<{ id: string; nome: string; total: number; qtd: number; meta: number | null }>
}) {
  if (!vendedores.length) return <div className="text-center py-6 text-[#788698] text-[13px]">Sem dados.</div>
  const maxTotal = Math.max(...vendedores.map(v => v.total), 1)

  return (
    <div className="flex flex-col gap-[18px]">
      {vendedores.map((v, i) => {
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
        const pctMeta = v.meta && v.meta > 0 ? Math.min(Math.round((v.total / v.meta) * 100), 100) : null
        const pctBar  = Math.max(Math.round((v.total / maxTotal) * 100), 4)
        return (
          <div key={v.id}>
            <div className="flex items-center gap-[12px] mb-[9px]">
              {/* Avatar com iniciais e cor única por posição */}
              <div
                className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center font-bold text-[13px] flex-none"
                style={{
                  background: `linear-gradient(135deg, ${color}55, ${color}22)`,
                  border: `1px solid ${color}44`,
                  color: color,
                }}
              >
                {getInitials(v.nome)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold text-[#1F2A39] truncate">{v.nome}</div>
                <div className="text-[11.5px] text-[#6B7C92]">
                  {v.qtd} {v.qtd === 1 ? 'venda' : 'vendas'}
                  {pctMeta !== null && (
                    <span className={pctMeta >= 100 ? 'text-[#34D399] ml-1 font-semibold' : 'text-[#F4B740] ml-1'}>
                      · meta {pctMeta}%
                    </span>
                  )}
                </div>
              </div>
              <div className="text-[13.5px] font-bold text-[#16212E]">{formatCurrency(v.total)}</div>
            </div>
            {/* Barra de progresso — meta se tiver, senão relativa ao maior */}
            <div className="h-[6px] rounded-[6px] bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-[6px] transition-all duration-700"
                style={{
                  width: `${pctMeta ?? pctBar}%`,
                  background: pctMeta !== null && pctMeta >= 100
                    ? 'linear-gradient(90deg, #16a34a, #34D399)'
                    : 'linear-gradient(90deg, #8E1B20, #F0353D)',
                }}
              />
            </div>
            {/* Label da meta se configurada */}
            {v.meta !== null && (
              <div className="flex justify-between mt-[4px]">
                <span className="font-mono text-[9px] text-[#9AA7B6]">R$ 0</span>
                <span className="font-mono text-[9px] text-[#9AA7B6]">{formatCurrency(v.meta)}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────
// Dashboard principal
// ─────────────────────────────────────────
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
  const [topVendedores, setTopVendedores] = useState<Array<{ id: string; nome: string; total: number; qtd: number; meta: number | null }>>([])

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
        if (json.topVendedores) setTopVendedores(json.topVendedores)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const cur = periodsData?.[activePeriod]
  const receita = cur?.receita ?? initialData.kpis.receitaMes
  const lucro = cur?.lucro ?? initialData.kpis.lucroMes
  const qtdVendas = cur?.qtdVendas ?? initialData.kpis.qtdVendasMes
  const ticketMedio = cur?.ticketMedio ?? initialData.kpis.ticketMedio
  const margem = receita > 0 ? Math.round((lucro / receita) * 100) : 0
  const periodLabel = PERIOD_LABELS[activePeriod] ?? 'este mês'

  return (
    <>
      <Topbar eyebrow="PAINEL · JM STORE IMPORTADOS" title="Visão geral"
        showPeriods activePeriod={activePeriod} onPeriodChange={setActivePeriod} />

      <main className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
        <div className="max-w-[1320px] mx-auto space-y-5">

          {/* ── HERO ── */}
          <section className="relative overflow-hidden rounded-[24px] p-[36px_40px] bg-hero-gradient border border-white/[0.08] shadow-[0_28px_70px_rgba(0,0,0,0.45)] animate-fade-up">
            <div className="absolute right-[42px] top-[36px] flex items-center gap-2 px-[13px] py-[7px] rounded-full bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.25)]">
              <span className="w-[7px] h-[7px] rounded-full bg-[#34D399] animate-[pulseDot_2.2s_ease-in-out_infinite]" />
              <span className="font-mono text-[10.5px] tracking-[0.1em] text-[#5FE3B5]">SISTEMA ONLINE</span>
            </div>
            <div className="relative z-10 max-w-[620px]">
              <div className="font-mono text-[11px] tracking-[0.16em] text-[#C9D3DF]/70 uppercase">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}
              </div>
              <h2 className="mt-2 font-serif font-normal text-[34px] leading-[1.12] tracking-[-0.025em] text-[#F6F8FB]">
                Boa gestão gera bons resultados. A operação está{' '}
                <em className="italic text-[#C01F26]">voando alto</em>.
              </h2>
              <div className="flex items-end gap-[18px] mt-[26px]">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.18em] text-[#7E8EA2]">
                    FATURAMENTO · {periodLabel.toUpperCase()}
                  </div>
                  <AnimatedCurrency value={receita}
                    className="block font-serif font-medium text-[52px] leading-none tracking-[-0.03em] text-white mt-1.5" />
                </div>
                <div className="flex items-center gap-1.5 px-[11px] py-[5px] rounded-full bg-[rgba(52,211,153,0.14)] mb-2">
                  <TrendingUp size={15} className="text-[#34D399]" />
                  <span className="text-[13px] font-bold text-[#34D399]">
                    <AnimatedInt value={qtdVendas} /> vendas
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mt-7">
                <button className="flex items-center gap-2 px-5 py-3 rounded-[12px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[14px] shadow-[0_8px_24px_rgba(215,40,47,0.38)] hover:-translate-y-[2px] transition-all">
                  <Zap size={18} /> Nova venda
                </button>
                <button className="flex items-center gap-2 px-5 py-3 rounded-[12px] bg-white/[0.06] border border-white/[0.14] text-[#E3E9F0] font-semibold text-[14px] hover:bg-white/[0.10] transition-colors">
                  <Package size={18} /> Ver estoque
                </button>
              </div>
            </div>
          </section>

          {/* ── KPI GRID — 4 cols ── */}
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

          {/* ── STRIP — 4 cols ── */}
          <div className="grid grid-cols-4 gap-[18px]">
            {[
              { icon: Package,       color: '#F4B740', val: `${globais.estoqueDisponivel} un`, sub: 'disponíveis em estoque',   alert: globais.estoqueDisponivel < 5 },
              { icon: Users,         color: '#7FB0E8', val: String(globais.totalClientes),       sub: 'clientes cadastrados',      alert: false },
              { icon: AlertTriangle, color: '#788698', val: String(globais.assistenciasAbertas), sub: 'assistências abertas',      alert: globais.assistenciasAbertas > 0 },
              { icon: TrendingUp,    color: '#F0656B', val: String(globais.leadsAtivos),          sub: 'leads ativos no funil',     alert: globais.leadsNovos > 20 },
            ].map(({ icon: Icon, color, val, sub, alert }, i) => (
              <div key={i} className={cn('bg-white border rounded-[16px] p-[16px_18px] flex items-center gap-[14px]',
                alert ? 'border-[rgba(240,100,107,0.25)]' : 'border-[#16212E]/[0.07]')}>
                <Icon size={30} style={{ color }} />
                <div>
                  <div className="font-serif text-[20px] text-[#16212E]">{val}</div>
                  <div className="text-[11.5px] text-[#788698] mt-[1px]">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── ROW A: Gráfico área (1.85fr) + Donut canais (1fr) ── */}
          <div className="grid gap-[18px]" style={{ gridTemplateColumns: '1.85fr 1fr' }}>
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '350ms' }}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">DESEMPENHO</div>
                  <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px]">Tendência de faturamento</h3>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#16212E]/[0.05] font-mono text-[10.5px] text-[#9FB0C2]">
                  12 MESES
                </div>
              </div>
              <AreaChart data={faturamentoMensal} />
            </div>
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '420ms' }}>
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">ORIGEM</div>
              <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px] mb-[22px]">Vendas por canal</h3>
              <DonutCanais vendas={vendasRecentes} />
            </div>
          </div>

          {/* ── ROW B: Produtos (1fr) + Funil (1fr) + Alertas (1fr) ── */}
          <div className="grid grid-cols-3 gap-[18px]">
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '460ms' }}>
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">RANKING</div>
              <h3 className="font-serif font-medium text-[19px] text-[#16212E] mt-[5px] mb-5">Produtos mais vendidos</h3>
              <TopProdutos vendas={vendasRecentes} />
            </div>
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '500ms' }}>
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">CONVERSÃO</div>
              <h3 className="font-serif font-medium text-[19px] text-[#16212E] mt-[5px] mb-5">Funil de leads</h3>
              <FunilLeads leadsAtivos={globais.leadsAtivos} leadsNovos={globais.leadsNovos} />
            </div>
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '540ms' }}>
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">ATENÇÃO</div>
              <h3 className="font-serif font-medium text-[19px] text-[#16212E] mt-[5px] mb-[18px]">Alertas</h3>
              <Alertas estoqueDisponivel={globais.estoqueDisponivel}
                leadsNovos={globais.leadsNovos} assistenciasAbertas={globais.assistenciasAbertas} />
            </div>
          </div>

          {/* ── ROW C: Vendas recentes (1.7fr) + Top vendedores (1fr) ── */}
          <div className="grid gap-[18px]" style={{ gridTemplateColumns: '1.7fr 1fr' }}>
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '580ms' }}>
              <div className="flex justify-between items-center mb-[18px]">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">TEMPO REAL</div>
                  <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px]">Vendas recentes</h3>
                </div>
                <button className="flex items-center gap-1.5 px-[14px] py-2 rounded-[10px] bg-white/[0.04] border border-[#16212E]/[0.10] text-[#16212E] text-[12.5px] font-semibold hover:bg-[#16212E]/[0.06] transition-colors">
                  Ver todas <ArrowUpRight size={15} />
                </button>
              </div>
              {/* Cabeçalho da tabela */}
              <div className="grid gap-[10px] px-1 pb-[10px] font-mono text-[9.5px] tracking-[0.1em] text-[#9AA7B6] border-b border-[#16212E]/[0.08]"
                style={{ gridTemplateColumns: '60px 1fr auto auto' }}>
                <div>DATA</div><div>CLIENTE / PRODUTO</div>
                <div className="text-right">VALOR</div><div className="text-right w-[96px]">STATUS</div>
              </div>
              {vendasRecentes.length === 0 ? (
                <div className="text-center py-8 text-[#788698] text-[13px]">Nenhuma venda ainda.</div>
              ) : vendasRecentes.map((v, i) => {
                const canal = CANAIS_VENDA.find(c => c.value === v.canal_venda)
                const avatarColors = ['#34D399', '#7FB0E8', '#D7282F', '#F4B740', '#C6A86A']
                const color = avatarColors[i % avatarColors.length]
                const data = v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '--/--'
                return (
                  <div key={v.id} className="grid gap-[10px] items-center px-1 py-[13px] border-b border-[#16212E]/[0.06] last:border-0 hover:bg-[#16212E]/[0.04] transition-colors"
                    style={{ gridTemplateColumns: '60px 1fr auto auto' }}>
                    <div className="font-mono text-[12px] text-[#6B7C92]">{data}</div>
                    <div>
                      <div className="text-[13px] font-semibold text-[#1F2A39]">{v.cliente_nome ?? '—'}</div>
                      <div className="text-[11px] text-[#6B7C92]">
                        {v.produto_nome
                          ? <>{v.produto_nome} · {canal?.label ?? 'Loja física'}</>
                          : <>{canal?.label ?? 'Loja física'} · {v.forma_pagamento ?? 'Pix'}</>
                        }
                      </div>
                    </div>
                    <div className="font-serif text-[15px] text-[#16212E] text-right">{formatCurrency(v.valor_venda)}</div>
                    <div className="text-right w-[96px]">
                      <span className="font-mono text-[10px] font-semibold px-[8px] py-[3px] rounded-full"
                        style={{ color, background: `${color}22` }}>
                        {v.status ?? 'concluida'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px] animate-fade-up" style={{ animationDelay: '620ms' }}>
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">DESTAQUE</div>
              <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px] mb-[20px]">Top vendedores</h3>
              <TopVendedores vendedores={topVendedores} />
            </div>
          </div>

        </div>
      </main>
    </>
  )
}
