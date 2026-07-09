'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Car, Loader2, Save } from 'lucide-react'
import { Input, Button, Badge, notify } from '@/components/ui'
import type { MatchVeiculo } from '@/lib/match-veiculos'

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))

const vazio = {
  categoria: '', marca: '', modelo: '',
  ano_min: '', ano_max: '', preco_max: '', km_max: '',
}

export function LeadInteressePanel({ leadId }: { leadId: number }) {
  const supabase = createClient()
  const [form, setForm] = useState(vazio)
  const [salvando, setSalvando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [matches, setMatches] = useState<MatchVeiculo[]>([])
  const [carregou, setCarregou] = useState(false)

  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const buscar = useCallback(async () => {
    setBuscando(true)
    try {
      const res = await fetch(`/api/match/lead/${leadId}`)
      const data = await res.json()
      setMatches(Array.isArray(data.matches) ? data.matches : [])
    } catch { /* ignora */ }
    setBuscando(false)
  }, [leadId])

  useEffect(() => {
    supabase.from('leads').select('interesse').eq('id', leadId).maybeSingle()
      .then(({ data }) => {
        const i = (data?.interesse ?? null) as Record<string, unknown> | null
        if (i) {
          setForm({
            categoria: (i.categoria as string) ?? '',
            marca: (i.marca as string) ?? '',
            modelo: (i.modelo as string) ?? '',
            ano_min: i.ano_min != null ? String(i.ano_min) : '',
            ano_max: i.ano_max != null ? String(i.ano_max) : '',
            preco_max: i.preco_max != null ? String(i.preco_max) : '',
            km_max: i.km_max != null ? String(i.km_max) : '',
          })
          buscar()
        }
        setCarregou(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  async function salvar() {
    setSalvando(true)
    const interesse = {
      categoria: form.categoria.trim() || null,
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      ano_min: num(form.ano_min),
      ano_max: num(form.ano_max),
      preco_max: num(form.preco_max),
      km_max: num(form.km_max),
    }
    const { error } = await supabase.from('leads').update({ interesse }).eq('id', leadId)
    setSalvando(false)
    if (error) { notify.bad(error.message); return }
    notify.ok('Interesse salvo — buscando veículos compatíveis…')
    buscar()
  }

  if (!carregou) return <div className="p-4 text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="animate-spin inline mr-2" />Carregando interesse…</div>

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="flex items-center gap-2 mb-3">
        <Car size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Interesse de compra &amp; Match</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <Input label="Categoria" value={form.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder="Carro, Moto…" />
        <Input label="Marca" value={form.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Ex: Honda" />
        <Input label="Modelo" wrapperClassName="col-span-2" value={form.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Ex: Civic" />
        <Input label="Ano mín" type="number" className="num" value={form.ano_min} onChange={(e) => set('ano_min', e.target.value)} placeholder="2018" />
        <Input label="Ano máx" type="number" className="num" value={form.ano_max} onChange={(e) => set('ano_max', e.target.value)} placeholder="2024" />
        <Input label="Preço máx" type="number" className="num" value={form.preco_max} onChange={(e) => set('preco_max', e.target.value)} />
        <Input label="Km máx" type="number" className="num" value={form.km_max} onChange={(e) => set('km_max', e.target.value)} placeholder="60000" />
      </div>

      <Button className="w-full mb-3" onClick={salvar} loading={salvando} icon={<Save size={15} strokeWidth={1.7} />}>
        Salvar interesse e buscar match
      </Button>

      {/* Resultados */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11.5px] font-semibold text-ink-2">Veículos compatíveis {matches.length > 0 && <span className="num">({matches.length})</span>}</span>
          {buscando && <Loader2 size={13} strokeWidth={1.7} className="animate-spin text-ink-3" />}
        </div>
        {matches.length === 0 && !buscando ? (
          <p className="text-[12px] text-ink-3 py-2">Nenhum veículo compatível ainda. Ajuste o interesse ou cadastre mais veículos no estoque.</p>
        ) : (
          <div className="space-y-1.5">
            {matches.map(({ veiculo, score }) => (
              <div key={veiculo.id}
                className="flex items-center gap-2 p-2 rounded-control border border-line hover:border-accent hover:bg-raised transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink truncate">{[veiculo.marca_nome, veiculo.produto_nome].filter(Boolean).join(' ') || 'Veículo'}</div>
                  <div className="text-[11px] text-ink-3 truncate">
                    {[veiculo.ano ? String(veiculo.ano) : null, veiculo.km != null ? `${veiculo.km.toLocaleString('pt-BR')} km` : null, veiculo.cor].filter(Boolean).join(' · ')} · <span className="num">{brl(veiculo.preco_venda)}</span>
                  </div>
                </div>
                <Badge tone={score >= 70 ? 'ok' : 'acc'} className="num shrink-0">{score}%</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
