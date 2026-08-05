'use client'

import { useEffect, useState } from 'react'
import { Plus, Wallet } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

interface Lanc { id: number; dia: string; campanha: string; gasto: number; fonte: string }

export function InvestimentoForm() {
  const [total, setTotal] = useState(0)
  const [lancs, setLancs] = useState<Lanc[]>([])
  const [dia, setDia] = useState(hoje())
  const [campanha, setCampanha] = useState('')
  const [gasto, setGasto] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    const r = await fetch('/api/tracker/investimento')
    const d = await r.json()
    setTotal(d.total ?? 0); setLancs(d.lancamentos ?? [])
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    const g = Number(gasto.replace(',', '.'))
    if (!dia || !Number.isFinite(g) || g < 0) return
    setSalvando(true)
    try {
      const r = await fetch('/api/tracker/investimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dia, campanha, gasto: g }),
      })
      if (r.ok) { setGasto(''); setCampanha(''); carregar() }
    } finally { setSalvando(false) }
  }

  return (
    <div className="rounded-[14px] border p-5" style={{ borderColor: C.line, background: C.card }}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><Wallet size={18} strokeWidth={1.9} /></span>
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold" style={{ color: C.ink }}>Investimento manual</h3>
          <p className="text-[12px]" style={{ color: C.ink3 }}>Lance o gasto de anúncio até a Meta ser conectada — já alimenta CAC e ROAS.</p>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}>Total 30d</div>
          <div className="text-[18px] font-bold tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{brl(total)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_120px_auto]">
        <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="tk-inv" />
        <input value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder="Campanha (opcional)" className="tk-inv" />
        <input value={gasto} onChange={(e) => setGasto(e.target.value)} placeholder="R$ 0,00" inputMode="decimal" className="tk-inv" />
        <button onClick={salvar} disabled={salvando} className="inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}><Plus size={15} strokeWidth={2} /> Lançar</button>
      </div>

      {lancs.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {lancs.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between text-[12.5px]">
              <span style={{ color: C.ink2 }}>{new Date(l.dia + 'T00:00:00').toLocaleDateString('pt-BR')} · {l.campanha}</span>
              <span className="font-semibold" style={{ color: C.ink }}>{brl(Number(l.gasto))}</span>
            </div>
          ))}
        </div>
      )}
      <style>{`.tk-inv{border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13px;color:${C.ink};background:#fff;outline:none}.tk-inv:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}
