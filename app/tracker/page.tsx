import Link from 'next/link'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { calcularDashboard } from '@/lib/tracker/dashboard'
import { SlidersHorizontal, TrendingUp, Zap } from 'lucide-react'

export const metadata = { title: 'Dashboard · Tracker Ads' }
export const dynamic = 'force-dynamic'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

function Kpi({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="rounded-[14px] border p-[16px_18px]" style={{ background: C.card, borderColor: C.line }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.ink3 }}>{label}</div>
      <div className="mt-1.5 text-[24px] font-bold leading-none tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{value}</div>
      {delta && (
        <div className="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: C.teal }}>
          <TrendingUp size={13} strokeWidth={2.2} /> {delta}
        </div>
      )}
    </div>
  )
}

function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border" style={{ background: C.card, borderColor: C.line }}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px]" style={{ color: C.ink3 }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <div className="grid min-h-[140px] place-items-center text-[13px]" style={{ color: C.ink3 }}>{texto}</div>
}

export default async function TrackerDashboardPage() {
  const { empresaId } = await trackerEmpresa()
  const d = await calcularDashboard(empresaId, 30)
  const funilMax = Math.max(1, ...d.funil.map((f) => f.valor))

  return (
    <div className="px-5 py-5 sm:px-7">
      {/* Cabeçalho */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Dashboard</h1>
          <p className="text-[13px]" style={{ color: C.ink3 }}>Visão geral e performance</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold" style={{ borderColor: C.line, background: C.card, color: C.ink2 }}>
          <SlidersHorizontal size={15} strokeWidth={1.9} /> Filtros
        </button>
      </header>

      {/* Complete o setup */}
      <Link href="/tracker/configuracoes" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-5 py-4" style={{ borderColor: '#f0d8a8', background: '#fdf6e9' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: '#e0a423' }}><Zap size={18} strokeWidth={1.9} /></span>
          <div>
            <div className="text-[14px] font-semibold" style={{ color: C.ink }}>Complete o setup da sua empresa</div>
            <div className="text-[12.5px]" style={{ color: C.ink2 }}>Configure canais, pipelines e agentes para começar a usar o sistema completo.</div>
          </div>
        </div>
        <span className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-white" style={{ background: '#e0a423' }}>Configurar agora →</span>
      </Link>

      {/* Faixa de contexto */}
      <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>
        Visão de rastreamento, campanhas Meta e qualificação — sem métricas de CRM (pipeline, receita de negócios).
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Leads rastreados" value={String(d.leadsRastreados)} delta="+0,0%" />
        <Kpi label="% rastreado" value={`${d.pctRastreado}%`} delta="+0,0%" />
        <Kpi label="Investimento Meta" value={d.investimentoMeta == null ? 'R$ 0,00' : brl(d.investimentoMeta)} delta="+0,0%" />
        <Kpi label="CAC real" value={d.cac == null ? '—' : brl(d.cac)} />
        <Kpi label="ROAS" value={d.roas == null ? '—' : `${d.roas}x`} />
        <Kpi label="Eventos CAPI" value={String(d.eventosCapi)} delta="+0,0%" />
      </div>

      {/* Conversas */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Visão geral das conversas" subtitle="De onde vieram as conversas — independente da qualificação no Inbox.">
          {d.conversas === 0 ? <Vazio texto="Sem conversas no período." /> : (
            <div className="flex items-baseline gap-2">
              <span className="text-[34px] font-bold leading-none tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{d.conversas}</span>
              <span className="text-[13px]" style={{ color: C.ink3 }}>mensagens trocadas</span>
            </div>
          )}
        </Panel>

        <Panel title="Origem das conversas" subtitle="Volume por origem de rastreamento.">
          {d.origens.length === 0 ? <Vazio texto="Sem dados de origem no período." /> : (
            <div className="space-y-2.5">
              {d.origens.map((o) => {
                const max = Math.max(1, ...d.origens.map((x) => x.total))
                return (
                  <div key={o.origem} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-[12.5px]" style={{ color: C.ink2 }}>{o.origem}</span>
                    <div className="h-[9px] flex-1 overflow-hidden rounded-full" style={{ background: '#eef1f5' }}>
                      <div className="h-full rounded-full" style={{ width: `${(o.total / max) * 100}%`, background: C.teal }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[12.5px] font-semibold" style={{ color: C.ink }}>{o.total}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Funil + Conversões */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Funil Meta" subtitle="Das conversas rastreadas até Conversão Meta no Inbox (qualificado, venda ou desqualificado)." action={<select className="rounded-[8px] border px-2.5 py-1.5 text-[12px]" style={{ borderColor: C.line, color: C.ink2 }} defaultValue="todas"><option value="todas">Todas as campanhas</option></select>}>
          {d.funil.every((f) => f.valor === 0) ? <Vazio texto="Nenhuma conversa rastreada no período." /> : (
            <div className="space-y-3">
              {d.funil.map((f) => (
                <div key={f.etapa}>
                  <div className="mb-1 flex justify-between text-[12.5px]">
                    <span style={{ color: C.ink2 }}>{f.etapa}</span>
                    <span className="font-semibold" style={{ color: C.ink }}>{f.valor}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ background: '#eef1f5' }}>
                    <div className="h-full rounded-full" style={{ width: `${(f.valor / funilMax) * 100}%`, background: C.tealDark }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Conversões e CAPI" subtitle="Eventos Conversions API confirmados — não confundir com fechamentos do CRM.">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[12px]" style={{ color: C.ink3 }}>Vendas realizadas</div>
              <div className="mt-1 text-[24px] font-bold tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{d.vendas}</div>
            </div>
            <div>
              <div className="text-[12px]" style={{ color: C.ink3 }}>Taxa de conversão</div>
              <div className="mt-1 text-[24px] font-bold tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{d.taxaConversao}%</div>
              <div className="text-[10.5px]" style={{ color: C.ink3 }}>Vendas ÷ conversas rastreadas</div>
            </div>
            <div>
              <div className="text-[12px]" style={{ color: C.ink3 }}>Faturamento registrado</div>
              <div className="mt-1 text-[20px] font-bold tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{brl(d.faturamento)}</div>
              <div className="text-[10.5px]" style={{ color: C.ink3 }}>Soma dos valores informados na qualificação (não é receita CRM)</div>
            </div>
          </div>
          {d.eventosCapi === 0 && <div className="mt-3 border-t pt-3 text-center text-[12.5px]" style={{ borderColor: C.line, color: C.ink3 }}>Nenhum evento CAPI enviado no período.</div>}
        </Panel>
      </div>

      {/* Tráfego pago (Meta) */}
      <div className="mt-4">
        <Panel title="Tráfego pago (Meta)" subtitle="Campanhas Meta — investimento, resultados reportados e leads rastreados.">
          <div className="grid min-h-[90px] place-items-center text-center">
            <div>
              <p className="text-[13px]" style={{ color: C.ink3 }}>Conecte o Business Manager para ver investimento e campanhas sincronizadas.</p>
              <Link href="/tracker/configuracoes" className="mt-2 inline-block text-[13px] font-semibold" style={{ color: C.tealDark }}>Ir para Integrações →</Link>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
