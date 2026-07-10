'use client'

import { Topbar } from '@/components/layout/topbar'
import { Badge, EmptyState } from '@/components/ui'
import type { Conversao } from '@/lib/conversao'
import { Filter, Clock, AlertTriangle, TrendingDown } from 'lucide-react'

function fmtH(h: number | null): string {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}min`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export function ConversaoView({ dados }: { dados: Conversao }) {
  const maxAlc = Math.max(1, ...dados.funil.map((f) => f.alcancaram))
  const piorVendedor = dados.vendedores.find((v) => v.semContato > 0) ?? dados.vendedores[0]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Conversão" />
      <div className="mx-auto w-full max-w-[900px] flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mb-5">
          <h1 className="text-[18px] font-semibold text-ink">Conversão & tempo de resposta</h1>
          <p className="mt-0.5 max-w-[560px] text-[13px] text-ink-3">Onde o mês trava: taxa de passagem entre etapas do funil (pipeline atual) e quanto o time demora para o 1º contato (últimos 90 dias).</p>
        </div>

        {/* Funil */}
        <div className="mb-6 rounded-card border border-line bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-ink"><Filter size={15} strokeWidth={1.8} className="text-accent" /> Funil de conversão</div>
          {dados.funil.length === 0 ? (
            <EmptyState icon={<Filter size={22} strokeWidth={1.6} />} title="Sem etapas de funil" description="Configure o funil em Sistema → Funil." />
          ) : (
            <div className="space-y-2">
              {dados.funil.map((f) => {
                const gargalo = f.slug === dados.gargaloSlug
                return (
                  <div key={f.slug}>
                    {f.taxa != null && (
                      <div className="flex items-center gap-1.5 pl-1 text-[11px]">
                        <TrendingDown size={11} strokeWidth={1.9} className={gargalo ? 'text-bad' : 'text-ink-3'} />
                        <span className={gargalo ? 'font-semibold text-bad' : 'text-ink-3'}>{f.taxa}% passaram{gargalo ? ' · gargalo' : ''}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="h-8 flex-1 overflow-hidden rounded-control bg-bg">
                        <div className={`flex h-full items-center rounded-control ${gargalo ? 'bg-bad/15' : 'bg-accent/12'} px-3`} style={{ width: `${Math.max(12, (f.alcancaram / maxAlc) * 100)}%` }}>
                          <span className="truncate text-[12.5px] font-medium text-ink">{f.label}</span>
                        </div>
                      </div>
                      <div className="w-24 text-right text-[12px] text-ink-2">
                        <span className="num font-semibold text-ink">{f.alcancaram}</span> alcanç.
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Tempo de resposta — resumo */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-card border border-line bg-card p-4">
            <div className="flex items-center gap-2 text-[12px] text-ink-3"><Clock size={14} strokeWidth={1.8} /> Tempo médio de 1º contato</div>
            <div className="num mt-1 text-[24px] font-semibold text-ink">{fmtH(dados.tempoMedioGeralH)}</div>
            <div className="text-[11px] text-ink-3">{dados.totalCohort} leads nos últimos 90 dias</div>
          </div>
          <div className={`rounded-card border p-4 ${dados.semContatoTotal > 0 ? 'border-bad/30 bg-bad/[0.03]' : 'border-line bg-card'}`}>
            <div className="flex items-center gap-2 text-[12px] text-ink-3"><AlertTriangle size={14} strokeWidth={1.8} className={dados.semContatoTotal > 0 ? 'text-bad' : ''} /> Sem 1º contato</div>
            <div className={`num mt-1 text-[24px] font-semibold ${dados.semContatoTotal > 0 ? 'text-bad' : 'text-ink'}`}>{dados.semContatoTotal}</div>
            <div className="text-[11px] text-ink-3">leads que nunca receberam ligação</div>
          </div>
        </div>

        {/* Por vendedor */}
        <div className="mb-4 rounded-card border border-line bg-card p-4">
          <div className="mb-3 text-[13.5px] font-semibold text-ink">Tempo de 1º contato por vendedor</div>
          {dados.vendedores.length === 0 ? (
            <p className="text-[12px] text-ink-3">Sem leads no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-3">
                    <th className="px-2 py-2 font-semibold">Vendedor</th>
                    <th className="px-2 py-2 text-right font-semibold">Leads</th>
                    <th className="px-2 py-2 text-right font-semibold">Sem contato</th>
                    <th className="px-2 py-2 text-right font-semibold">Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.vendedores.map((v) => {
                    const alerta = v.usuario_id === piorVendedor?.usuario_id && (v.semContato > 0 || (v.tempoMedioH ?? 0) > 24)
                    return (
                      <tr key={v.usuario_id} className="border-b border-line-soft last:border-0">
                        <td className="px-2 py-2 font-medium text-ink">{v.nome}{alerta && <Badge tone="bad" className="ml-2">atenção</Badge>}</td>
                        <td className="px-2 py-2 text-right num text-ink-2">{v.leads}</td>
                        <td className={`px-2 py-2 text-right num ${v.semContato > 0 ? 'font-semibold text-bad' : 'text-ink-2'}`}>{v.semContato}</td>
                        <td className="px-2 py-2 text-right num text-ink">{fmtH(v.tempoMedioH)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Por canal */}
        <div className="rounded-card border border-line bg-card p-4">
          <div className="mb-3 text-[13.5px] font-semibold text-ink">Tempo de 1º contato por canal</div>
          {dados.canais.length === 0 ? (
            <p className="text-[12px] text-ink-3">Sem leads no período.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dados.canais.map((c) => (
                <div key={c.canal} className="rounded-control border border-line px-3 py-2">
                  <div className="text-[12px] font-medium capitalize text-ink">{c.canal}</div>
                  <div className="text-[11px] text-ink-3"><span className="num text-ink-2">{c.leads}</span> leads · <span className="num">{fmtH(c.tempoMedioH)}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
