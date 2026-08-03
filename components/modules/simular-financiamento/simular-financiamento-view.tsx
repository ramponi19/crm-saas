'use client'

import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Card, Input, Select, StatCard } from '@/components/ui'

type Sistema = 'sac' | 'price'

function num(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

export function SimularFinanciamentoView() {
  const [valor, setValor] = useState('300000')
  const [entrada, setEntrada] = useState('60000')
  const [prazo, setPrazo] = useState('360')
  const [taxa, setTaxa] = useState('0,9') // % a.m.
  const [sistema, setSistema] = useState<Sistema>('sac')

  const r = useMemo(() => {
    const pv = Math.max(0, num(valor) - num(entrada))
    const i = num(taxa) / 100
    const n = Math.max(1, Math.round(num(prazo)))
    if (pv <= 0) return { pv: 0, primeira: 0, ultima: 0, total: 0, juros: 0, amort: 0 }

    if (sistema === 'price') {
      const pmt = i > 0 ? (pv * i) / (1 - Math.pow(1 + i, -n)) : pv / n
      const total = pmt * n
      return { pv, primeira: pmt, ultima: pmt, total, juros: total - pv, amort: pv / n }
    }
    // SAC
    const amort = pv / n
    const primeira = amort + pv * i
    const ultima = amort + amort * i
    const juros = i * (n * pv - (amort * n * (n - 1)) / 2)
    return { pv, primeira, ultima, total: pv + juros, juros, amort }
  }, [valor, entrada, prazo, taxa, sistema])

  const parcelas = useMemo(() => {
    const n = Math.max(1, Math.round(num(prazo)))
    const i = num(taxa) / 100
    const pontos = [1, Math.ceil(n / 2), n].filter((v, idx, a) => a.indexOf(v) === idx)
    if (sistema === 'price') return pontos.map((k) => ({ k, valor: r.primeira }))
    return pontos.map((k) => {
      const saldoAntes = r.pv - r.amort * (k - 1)
      return { k, valor: r.amort + saldoAntes * i }
    })
  }, [prazo, taxa, sistema, r])

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto grid max-w-[1000px] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title="Dados do financiamento">
          <div className="grid gap-4">
            <Input label="Valor do bem (R$)" className="num" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))} />
            <Input label="Entrada (R$)" className="num" value={entrada} onChange={(e) => setEntrada(e.target.value.replace(/[^0-9.,]/g, ''))} />
            <Input label="Prazo (meses)" className="num" value={prazo} onChange={(e) => setPrazo(e.target.value.replace(/[^0-9]/g, ''))} />
            <Input label="Taxa de juros (% ao mês)" className="num" value={taxa} onChange={(e) => setTaxa(e.target.value.replace(/[^0-9.,]/g, ''))} hint="Ex.: 0,9 para 0,9% a.m." />
            <Select label="Sistema de amortização" value={sistema} onChange={(e) => setSistema(e.target.value as Sistema)}>
              <option value="sac">SAC (parcela decrescente)</option>
              <option value="price">Price (parcela fixa)</option>
            </Select>
            <div className="rounded-card border border-line bg-raised px-3 py-2.5 text-[12.5px] text-ink-2">
              Valor financiado: <span className="num font-semibold text-ink">{formatCurrency(r.pv)}</span>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card [&>*]:border-line-soft [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b">
            <StatCard bare label="1ª parcela" value={formatCurrency(r.primeira)} />
            <StatCard bare label={sistema === 'sac' ? 'Última parcela' : 'Parcela (fixa)'} value={formatCurrency(r.ultima)} />
            <StatCard bare label="Total pago" value={formatCurrency(r.total)} />
            <StatCard bare label="Total de juros" value={formatCurrency(r.juros)} delta={r.total > 0 ? `${Math.round((r.juros / r.total) * 100)}% do total` : undefined} deltaTone="warn" />
          </div>

          <Card title="Parcelas ao longo do prazo" flush>
            <div className="divide-y divide-line-soft">
              {parcelas.map((p) => (
                <div key={p.k} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="text-ink-2">Parcela {p.k}</span>
                  <span className="num font-semibold text-ink">{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
          </Card>
          <p className="text-[11.5px] text-ink-3">Simulação aproximada (sem seguros, taxas administrativas ou TR). No SAC a parcela cai a cada mês; no Price é fixa.</p>
        </div>
      </div>
    </main>
  )
}
