'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Landmark, Loader2, Plus, Trash2 } from 'lucide-react'
import { Input, Button, Badge, notify } from '@/components/ui'

interface Ficha {
  id: number
  banco: string | null
  valor: number | null
  entrada: number | null
  parcelas: number | null
  taxa: number | null
  status: string
}

const STATUS: Record<string, { label: string; tone: 'warn' | 'ok' | 'bad' }> = {
  enviada: { label: 'Enviada', tone: 'warn' },
  aprovada: { label: 'Aprovada', tone: 'ok' },
  negada: { label: 'Negada', tone: 'bad' },
}
const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))

export function LeadFinanciamentoPanel({ leadId }: { leadId: number }) {
  const supabase = createClient()
  const { empresa } = useEmpresa()
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [carregou, setCarregou] = useState(false)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState({ banco: '', valor: '', entrada: '', parcelas: '', taxa: '' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('fichas_financiamento')
      .select('id, banco, valor, entrada, parcelas, taxa, status')
      .eq('lead_id', leadId).order('created_at', { ascending: false })
    setFichas((data ?? []) as Ficha[])
    setCarregou(true)
  }, [leadId, supabase])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!empresa?.id) { notify.bad('Empresa não carregada'); return }
    if (!form.banco.trim()) { notify.warn('Informe o banco'); return }
    setCriando(true)
    const { error } = await supabase.from('fichas_financiamento').insert({
      empresa_id: empresa.id, lead_id: leadId, banco: form.banco.trim(),
      valor: num(form.valor), entrada: num(form.entrada), parcelas: num(form.parcelas), taxa: num(form.taxa),
      status: 'enviada',
    })
    setCriando(false)
    if (error) { notify.bad(error.message); return }
    setForm({ banco: '', valor: '', entrada: '', parcelas: '', taxa: '' })
    notify.ok('Ficha adicionada')
    carregar()
  }

  async function mudarStatus(f: Ficha, status: string) {
    const { error } = await supabase.from('fichas_financiamento').update({ status }).eq('id', f.id)
    if (error) { notify.bad('Erro ao atualizar'); return }
    if (status === 'negada') notify.warn('Crédito negado', 'Se o lead cair, use o motivo de perda "Crédito negado".')
    else notify.ok('Status atualizado')
    carregar()
  }

  async function excluir(f: Ficha) {
    const { error } = await supabase.from('fichas_financiamento').delete().eq('id', f.id)
    if (error) { notify.bad('Erro ao excluir'); return }
    carregar()
  }

  if (!carregou) return <div className="p-4 text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="animate-spin inline mr-2" />Carregando F&amp;I…</div>

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="flex items-center gap-2 mb-3">
        <Landmark size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Financiamento (F&amp;I)</span>
      </div>

      {fichas.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {fichas.map((f) => {
            const st = STATUS[f.status] ?? STATUS.enviada
            return (
              <div key={f.id} className="flex items-center gap-2 p-2 rounded-control border border-line">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink truncate">{f.banco || 'Banco'}</div>
                  <div className="text-[11px] text-ink-3 truncate">
                    <span className="num">{brl(f.valor)}</span>
                    {f.parcelas ? <> · <span className="num">{f.parcelas}x</span></> : null}
                    {f.taxa != null ? <> · <span className="num">{f.taxa}%</span> a.m.</> : null}
                  </div>
                </div>
                <select value={f.status} onChange={(e) => mudarStatus(f, e.target.value)} className="h-7 rounded-control border border-line bg-card px-1.5 text-[11.5px] text-ink">
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <Badge tone={st.tone} className="shrink-0">{st.label}</Badge>
                <button type="button" onClick={() => excluir(f)} className="text-ink-3 hover:text-bad shrink-0"><Trash2 size={14} strokeWidth={1.7} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Input wrapperClassName="col-span-2" label="Banco" value={form.banco} onChange={(e) => set('banco', e.target.value)} placeholder="Ex: Banco Pan, BV…" />
        <Input label="Valor financiado" type="number" className="num" value={form.valor} onChange={(e) => set('valor', e.target.value)} />
        <Input label="Entrada" type="number" className="num" value={form.entrada} onChange={(e) => set('entrada', e.target.value)} />
        <Input label="Parcelas" type="number" className="num" value={form.parcelas} onChange={(e) => set('parcelas', e.target.value)} placeholder="48" />
        <Input label="Taxa % a.m." type="number" className="num" value={form.taxa} onChange={(e) => set('taxa', e.target.value)} placeholder="1,89" />
      </div>
      <Button className="w-full mt-2.5" variant="outline" onClick={adicionar} loading={criando} icon={<Plus size={15} strokeWidth={1.7} />}>
        Adicionar ficha
      </Button>
    </div>
  )
}
