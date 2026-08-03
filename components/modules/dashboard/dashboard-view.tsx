'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Package, Users, AlertTriangle, CheckSquare, CircleAlert, Download, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, CANAIS_VENDA } from '@/lib/utils'
import { AnimatedCurrency, AnimatedInt } from '@/components/ui/animated-value'
import { AreaChart } from '@/components/ui/area-chart'
import { Card, StatCard, Badge, Button } from '@/components/ui'
import { OnboardingCard } from './onboarding-card'
import { cn } from '@/lib/utils'
import { useEmpresa } from '@/lib/empresa-context'
import { createClient } from '@/lib/supabase/client'

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
  topProdutos: Array<{ nome: string; qtd: number }>
  funilLeads: { novo: number; em_contato: number; negociando: number; convertido: number; perdido: number }
  porCanal?: Record<string, number>
}
interface PeriodKpis { receita: number; lucro: number; qtdVendas: number; ticketMedio: number }

const PERIOD_LABELS: Record<string, string> = {
  hoje: 'hoje', '7d': 'últimos 7 dias', '30d': 'últimos 30 dias', mes: 'este mês', ano: 'este ano',
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

const getInitials = (nome: string) => nome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()

// Cores (token hex) para SVG/gráficos — this file não é components/ui.
const OK = '#188A54', ACC = '#2E5CE6', INK2 = '#5C6470', INK3 = '#9199A3', WARN = '#B45309'

// ── Donut — vendas por canal ──
const CANAL_META: Record<string, { color: string; label: string }> = {
  whatsapp: { color: OK, label: 'WhatsApp' },
  instagram: { color: ACC, label: 'Instagram' },
  loja_fisica: { color: INK3, label: 'Loja física' },
  site: { color: INK2, label: 'Site' },
}
function DonutCanais({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (!total) return <div className="py-8 text-center text-[13px] text-ink-3">Sem dados ainda.</div>
  const segs = Object.entries(counts).map(([c, n]) => ({
    label: CANAL_META[c]?.label ?? c, color: CANAL_META[c]?.color ?? INK3, pct: Math.round((n / total) * 100),
  }))
  const R = 52, cx = 70, cy = 70, C = 2 * Math.PI * R
  let off = 0
  const rings = segs.map((s, i) => {
    const len = (C * s.pct) / 100
    const el = <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color} strokeWidth={14} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} />
    off += len; return el
  })
  return (
    <div className="flex items-center gap-[18px]">
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flex: 'none' }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(21,24,28,0.07)" strokeWidth={14} />
        {rings}
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#15181C" fontSize={22} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" fill={INK3} fontSize={9} letterSpacing="1">VENDAS</text>
      </svg>
      <div className="flex flex-1 flex-col gap-3">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: s.color }} />
            <span className="flex-1 text-[13px] text-ink-2">{s.label}</span>
            <span className="num text-[13px] font-semibold text-ink">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Top produtos ──
function TopProdutos({ produtos }: { produtos: Array<{ nome: string; qtd: number }> }) {
  if (!produtos.length) return <div className="py-8 text-center text-[13px] text-ink-3">Sem vendas no período.</div>
  const maxQtd = Math.max(...produtos.map((p) => p.qtd), 1)
  return (
    <div className="flex flex-col gap-3.5">
      {produtos.map((p, i) => (
        <div key={i}>
          <div className="mb-1.5 flex justify-between">
            <span className="text-[12.5px] font-medium text-ink">{p.nome}</span>
            <span className="num text-[12px] text-ink-3">{p.qtd} {p.qtd === 1 ? 'venda' : 'vendas'}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className={cn('h-full rounded-full', i === 0 ? 'bg-accent' : 'bg-ink/25')} style={{ width: `${(p.qtd / maxQtd) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Funil de leads ──
function FunilLeads({ funil }: { funil: DashboardData['funilLeads'] }) {
  const rows = [
    { label: 'Novos leads', val: funil.novo, cls: 'bg-ink-3' },
    { label: 'Em contato', val: funil.em_contato, cls: 'bg-ink-2' },
    { label: 'Negociando', val: funil.negociando, cls: 'bg-accent' },
    { label: 'Convertido', val: funil.convertido, cls: 'bg-ok' },
  ]
  const maxVal = Math.max(...rows.map((r) => r.val), 1)
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="relative h-9 flex-1 overflow-hidden rounded-control bg-ink/[0.05]">
            <div className={cn('flex h-full items-center rounded-control px-3', r.cls)} style={{ width: `${Math.max((r.val / maxVal) * 100, 12)}%` }}>
              <span className="whitespace-nowrap text-[12px] font-semibold text-white">{r.label}</span>
            </div>
          </div>
          <span className="num w-8 text-right text-[14px] font-bold text-ink">{r.val}</span>
        </div>
      ))}
    </div>
  )
}

// ── Alertas ──
function Alertas({ estoqueDisponivel, leadsNovos, assistenciasAbertas }: { estoqueDisponivel: number; leadsNovos: number; assistenciasAbertas: number }) {
  const items = [
    estoqueDisponivel < 5 && { tone: 'warn' as const, icon: Package, title: 'Estoque baixo', desc: `Apenas ${estoqueDisponivel} unidade(s) disponível — reposição necessária.` },
    assistenciasAbertas > 0 && { tone: 'bad' as const, icon: AlertTriangle, title: 'Assistências abertas', desc: `${assistenciasAbertas} ordem(s) em andamento.` },
    leadsNovos > 20 && { tone: 'acc' as const, icon: Users, title: `${leadsNovos} leads sem tratativa`, desc: 'Leads acumulados aguardando primeiro contato.' },
  ].filter(Boolean) as Array<{ tone: 'warn' | 'bad' | 'acc'; icon: typeof Package; title: string; desc: string }>

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-ok-soft text-ok"><CheckSquare size={18} strokeWidth={1.7} /></div>
        <span className="text-[13px] font-semibold text-ink">Tudo em ordem</span>
        <span className="text-[11px] text-ink-3">Sem alertas críticos no momento.</span>
      </div>
    )
  }
  const TONE: Record<string, string> = { warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', acc: 'bg-accent-soft text-accent' }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((a, i) => {
        const Icon = a.icon
        return (
          <div key={i} className="flex items-start gap-3 rounded-card border border-line-soft p-3">
            <span className={cn('grid h-8 w-8 flex-none place-items-center rounded-control', TONE[a.tone])}><Icon size={16} strokeWidth={1.7} /></span>
            <div>
              <div className="text-[13px] font-semibold text-ink">{a.title}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2">{a.desc}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Top vendedores ──
function TopVendedores({ vendedores }: { vendedores: Array<{ id: string; nome: string; total: number; qtd: number; meta: number | null }> }) {
  if (!vendedores.length) return <div className="py-6 text-center text-[13px] text-ink-3">Sem dados.</div>
  const maxTotal = Math.max(...vendedores.map((v) => v.total), 1)
  return (
    <div className="flex flex-col gap-4">
      {vendedores.map((v) => {
        const pctMeta = v.meta && v.meta > 0 ? Math.min(Math.round((v.total / v.meta) * 100), 100) : null
        const pctBar = Math.max(Math.round((v.total / maxTotal) * 100), 4)
        const bateuMeta = pctMeta !== null && pctMeta >= 100
        return (
          <div key={v.id}>
            <div className="mb-2 flex items-center gap-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-[12px] font-bold text-white">{getInitials(v.nome)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{v.nome}</div>
                <div className="text-[11.5px] text-ink-3">
                  {v.qtd} {v.qtd === 1 ? 'venda' : 'vendas'}
                  {pctMeta !== null && <span className={cn('ml-1 font-semibold', bateuMeta ? 'text-ok' : 'text-warn')}>· meta {pctMeta}%</span>}
                </div>
              </div>
              <div className="num text-[13px] font-bold text-ink">{formatCurrency(v.total)}</div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className={cn('h-full rounded-full transition-all', bateuMeta ? 'bg-ok' : 'bg-accent')} style={{ width: `${pctMeta ?? pctBar}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Follow-ups ──
function FollowupsCard() {
  type Task = { id: number; titulo: string; vencimento: string | null; lead_nome: string | null }
  const [tarefas, setTarefas] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) { setLoaded(true); return }
      const { data: rows } = await supabase
        .from('tarefas').select('id, titulo, vencimento, leads(nome)')
        .eq('concluida', false).eq('responsavel_id', user.id)
        .order('vencimento', { nullsFirst: false }).limit(6)
      type Row = { id: number; titulo: string; vencimento: string | null; leads: { nome: string | null } | { nome: string | null }[] | null }
      const one = (r: Row['leads']) => (Array.isArray(r) ? r[0] ?? null : r)
      setTarefas(((rows ?? []) as unknown as Row[]).map((t) => ({ id: t.id, titulo: t.titulo, vencimento: t.vencimento, lead_nome: one(t.leads)?.nome ?? null })))
      setLoaded(true)
    })
  }, [])

  if (!loaded || tarefas.length === 0) return null
  const nowMs = Date.now()
  const diaMes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return (
    <Card title="Meus follow-ups" actions={<Link href="/tarefas" className="text-[12px] font-semibold text-accent hover:underline">Ver tarefas →</Link>}>
      <div className="grid gap-x-8 sm:grid-cols-2">
        {tarefas.map((t) => {
          const atrasada = t.vencimento && new Date(t.vencimento).getTime() < nowMs
          return (
            <div key={t.id} className="flex items-center gap-2 border-b border-line-soft py-2.5 last:border-0">
              {atrasada ? <CircleAlert size={15} strokeWidth={1.7} className="shrink-0 text-bad" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              <span className="flex-1 truncate text-[13px] text-ink">{t.titulo}{t.lead_nome ? <span className="text-ink-3"> · {t.lead_nome}</span> : ''}</span>
              {t.vencimento && <span className={cn('num text-[11px] shrink-0', atrasada ? 'font-semibold text-bad' : 'text-ink-3')}>{diaMes(t.vencimento)}</span>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutro'> = {
  concluida: 'ok', pendente: 'warn', encomenda: 'warn', pendente_entrega: 'warn',
  cancelada: 'bad', devolvido: 'neutro',
}

export function DashboardView({ data: initialData }: { data: DashboardData }) {
  const { empresa } = useEmpresa()
  const router = useRouter()
  const [userName, setUserName] = useState<string | null>(null)
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
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) return
      const { data: perfil } = await supabase.from('usuarios').select('nome').eq('id', user.id).single()
      if (perfil?.nome) setUserName(perfil.nome.trim().split(' ')[0])
      else {
        const meta = user.user_metadata
        const name: string | undefined = meta?.nome ?? meta?.full_name ?? meta?.name
        setUserName(name ? name.split(' ')[0] : (user.email?.split('@')[0] ?? null))
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
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

  const spark = faturamentoMensal.slice(-7).map((m) => m.total)
  const sparkNorm = spark.length > 1 ? (() => { const mx = Math.max(...spark, 1); return spark.map((v) => v / mx) })() : undefined

  return (
    <>
      <Topbar title="Visão geral" showPeriods activePeriod={activePeriod} onPeriodChange={setActivePeriod} />

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-bg px-4 py-5 scrollbar-thin sm:px-6 sm:py-6">
        <div className="mx-auto max-w-[1240px] space-y-4">

          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">{saudacao()}{userName ? `, ${userName}` : ''}.</h1>
              <p className="mt-0.5 text-[13px] text-ink-2">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                {globais.leadsNovos > 0 && <> — <span className="font-medium text-ink">{globais.leadsNovos}</span> leads aguardam primeira resposta.</>}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" icon={<Download size={15} strokeWidth={1.7} />} onClick={() => router.push('/relatorios')}>Exportar</Button>
              <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => router.push('/pdv')}>Nova venda</Button>
            </div>
          </div>

          <OnboardingCard />

          {/* KPIs */}
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            <StatCard bare label={`Vendas · ${periodLabel}`} value={<AnimatedCurrency value={receita} />} spark={sparkNorm} />
            <StatCard bare label="Lucro bruto" value={<AnimatedCurrency value={lucro} />} delta={`margem de ${margem}%`} deltaTone={margem >= 0 ? 'ok' : 'bad'} />
            <StatCard bare label="Ticket médio" value={<AnimatedCurrency value={ticketMedio} />} delta="por venda fechada" deltaTone="neutral" />
            <StatCard bare label="Vendas fechadas" value={<AnimatedInt value={qtdVendas} />} delta="no período" deltaTone="neutral" />
          </div>

          {/* Strip secundário */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { icon: Package, val: `${globais.estoqueDisponivel} un`, sub: 'em estoque', alerta: globais.estoqueDisponivel < 5 },
              { icon: Users, val: String(globais.totalClientes), sub: 'clientes', alerta: false },
              { icon: AlertTriangle, val: String(globais.assistenciasAbertas), sub: 'assistências abertas', alerta: globais.assistenciasAbertas > 0 },
              { icon: Users, val: String(globais.leadsAtivos), sub: 'leads ativos', alerta: globais.leadsNovos > 20 },
            ].map(({ icon: Icon, val, sub, alerta }, i) => (
              <div key={i} className={cn('flex items-center gap-3 rounded-card border bg-card p-4', alerta ? 'border-warn/30' : 'border-line')}>
                <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-control', alerta ? 'bg-warn-soft text-warn' : 'bg-ink/[0.04] text-ink-3')}><Icon size={17} strokeWidth={1.7} /></span>
                <div>
                  <div className="num text-[18px] font-bold text-ink">{val}</div>
                  <div className="text-[11px] text-ink-3">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <FollowupsCard />

          {/* Gráfico + Donut */}
          <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:minmax(0,1.85fr)_minmax(0,1fr)]">
            <Card title="Tendência de faturamento" actions={<span className="num text-[11px] text-ink-3">12 meses</span>}>
              <AreaChart data={faturamentoMensal} />
            </Card>
            <Card title="Vendas por canal">
              <DonutCanais counts={initialData.porCanal ?? {}} />
            </Card>
          </div>

          {/* Produtos + Funil + Alertas */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Produtos mais vendidos"><TopProdutos produtos={initialData.topProdutos} /></Card>
            <Card title="Funil de leads"><FunilLeads funil={initialData.funilLeads} /></Card>
            <Card title="Alertas"><Alertas estoqueDisponivel={globais.estoqueDisponivel} leadsNovos={globais.leadsNovos} assistenciasAbertas={globais.assistenciasAbertas} /></Card>
          </div>

          {/* Vendas recentes + Top vendedores */}
          <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:minmax(0,1.7fr)_minmax(0,1fr)]">
            <Card title="Vendas recentes" flush>
              {vendasRecentes.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-ink-3">Nenhuma venda ainda.</div>
              ) : (
                <div>
                  {vendasRecentes.map((v) => {
                    const canal = CANAIS_VENDA.find((c) => c.value === v.canal_venda)
                    const data = v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
                    return (
                      <div key={v.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0 hover:bg-raised">
                        <span className="num w-[46px] flex-none text-[12px] text-ink-3">{data}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-ink">{v.cliente_nome ?? '—'}</div>
                          <div className="truncate text-[11px] text-ink-3">{v.produto_nome ? `${v.produto_nome} · ${canal?.label ?? 'Loja física'}` : `${canal?.label ?? 'Loja física'} · ${v.forma_pagamento ?? 'Pix'}`}</div>
                        </div>
                        <span className="num flex-none text-[13px] font-semibold text-ink">{formatCurrency(v.valor_venda)}</span>
                        <Badge tone={STATUS_TONE[v.status ?? 'concluida'] ?? 'neutro'}>{v.status ?? 'concluída'}</Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
            <Card title="Top vendedores"><TopVendedores vendedores={topVendedores} /></Card>
          </div>

        </div>
      </main>
    </>
  )
}
