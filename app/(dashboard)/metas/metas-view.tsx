'use client'

import { useState } from 'react'
import { TrendingUp, Target, Save } from 'lucide-react'
import { Card, StatCard, Button, Input, notify } from '@/components/ui'

export interface MetaVendedor {
  usuarioId: string
  nome: string
  meta: number
  realizado: number
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function pct(realizado: number, meta: number) {
  return meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : 0
}

function Barra({ realizado, meta }: { realizado: number; meta: number }) {
  const p = pct(realizado, meta)
  const cor = p >= 100 ? 'bg-ok' : p >= 60 ? 'bg-accent' : 'bg-warn'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${meta > 0 ? p : 0}%` }} />
    </div>
  )
}

export function MetasView({ mesAno, metaEmpresa, realizadoTotal, forecast, vendedores }: {
  mesAno: string
  metaEmpresa: number
  realizadoTotal: number
  forecast: number
  vendedores: MetaVendedor[]
}) {
  const [metas, setMetas] = useState<Record<string, string>>(
    () => Object.fromEntries(vendedores.map(v => [v.usuarioId, v.meta ? String(v.meta) : '']))
  )
  const [salvando, setSalvando] = useState<string | null>(null)

  const mesLabel = new Date(`${mesAno}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  async function salvar(usuarioId: string) {
    setSalvando(usuarioId)
    try {
      const res = await fetch('/api/metas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId, mesAno, meta: Number(metas[usuarioId] || 0) }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error) }
      notify.ok('Meta salva')
    } catch (e) {
      notify.bad('Erro ao salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSalvando(null)
    }
  }

  const progressoEmpresa = pct(realizadoTotal, metaEmpresa)

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[1000px] space-y-5">
        <p className="text-[13px] text-ink-2 capitalize">{mesLabel}</p>

        {/* Resumo */}
        <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-3 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
          <StatCard bare label="Meta da empresa" value={metaEmpresa > 0 ? brl(metaEmpresa) : '—'} />
          <StatCard bare label="Realizado" value={brl(realizadoTotal)} delta={metaEmpresa > 0 ? `${progressoEmpresa}% da meta` : undefined} deltaTone={progressoEmpresa >= 100 ? 'ok' : 'neutral'} />
          <StatCard bare label="Forecast (pipeline)" value={brl(forecast)} delta="ponderado por etapa" deltaTone="neutral" />
        </div>

        {metaEmpresa > 0 && (
          <Card title={<span className="flex items-center gap-2"><Target size={16} strokeWidth={1.7} className="text-accent" /> Progresso da empresa</span>}>
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="font-semibold text-ink-2">{brl(realizadoTotal)} de {brl(metaEmpresa)}</span>
              <span className="num font-bold text-ink">{progressoEmpresa}%</span>
            </div>
            <Barra realizado={realizadoTotal} meta={metaEmpresa} />
            <p className="mt-2 text-[11.5px] text-ink-3">A meta da empresa vem de Configurações → Preferências (meta de vendas mensal).</p>
          </Card>
        )}

        {/* Por vendedor */}
        <Card title={<span className="flex items-center gap-2"><TrendingUp size={16} strokeWidth={1.7} className="text-accent" /> Metas por vendedor</span>} flush>
          {vendedores.length === 0 ? (
            <p className="p-6 text-[13px] text-ink-3">Nenhum vendedor ativo.</p>
          ) : (
            <div className="divide-y divide-line-soft">
              {vendedores.map(v => {
                const metaNum = Number(metas[v.usuarioId] || 0)
                return (
                  <div key={v.usuarioId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-[140px] flex-1">
                      <div className="text-[13.5px] font-semibold text-ink">{v.nome}</div>
                      <div className="num text-[12px] text-ink-3">{brl(v.realizado)}{metaNum > 0 ? ` · ${pct(v.realizado, metaNum)}%` : ''}</div>
                    </div>
                    <div className="w-[180px] flex-none">
                      <Barra realizado={v.realizado} meta={metaNum} />
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      <span className="text-[12px] text-ink-3">Meta</span>
                      <Input
                        type="number" min={0}
                        wrapperClassName="w-[130px]"
                        className="num"
                        value={metas[v.usuarioId] ?? ''}
                        onChange={e => setMetas(m => ({ ...m, [v.usuarioId]: e.target.value }))}
                        placeholder="0"
                      />
                      <Button variant="outline" size="sm" loading={salvando === v.usuarioId} icon={<Save size={14} strokeWidth={1.7} />} onClick={() => salvar(v.usuarioId)}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}
