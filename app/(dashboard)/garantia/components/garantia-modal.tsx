'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Garantia {
  id?: number
  protocolo: string | null
  tipo: string | null
  status: string | null
  defeito_relatado: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  imei_serial: string | null
  dentro_garantia: boolean | null
  dias_garantia_restantes: number | null
  data_entrada: string | null
  observacoes: string | null
  estado_entrada: string | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  cliente_id: number | null
  produto_id: number | null
  clientes?: { nome: string; telefone: string | null } | null
  produtos?: { nome: string } | null
  created_at?: string | null
}

interface Props {
  garantia: Garantia | null
  isNew: boolean
  onClose: () => void
}

const EMPTY: Garantia = {
  protocolo: null, tipo: 'garantia', status: 'em_analise',
  defeito_relatado: null, parecer_tecnico: null, orcamento_valor: null,
  imei_serial: null, dentro_garantia: true, dias_garantia_restantes: null,
  data_entrada: new Date().toISOString().split('T')[0], observacoes: null,
  estado_entrada: null, celular_reserva_fornecido: false, modelo_reserva: null,
  cliente_id: null, produto_id: null,
}

const STATUS_OPTIONS = [
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aprovado',   label: 'Aprovado' },
  { value: 'em_reparo',  label: 'Em reparo' },
  { value: 'concluido',  label: 'Concluído' },
  { value: 'entregue',   label: 'Entregue' },
  { value: 'recusado',   label: 'Recusado' },
]

// Design tokens do modelo
const inputCls = [
  'w-full rounded-[10px] px-3 py-2.5 text-sm outline-none transition-colors',
  'text-[#1F2A39] placeholder:text-[#9AA7B6]',
  'bg-white border border-[#16212E]/[0.10] focus:border-[#16212E]/20',
].join(' ')
const labelCls = 'block text-[9.5px] font-mono tracking-[0.15em] text-[#9AA7B6] uppercase mb-1.5'

const supabase = createClient()

export default function GarantiaModal({ garantia, isNew, onClose }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<Garantia>(isNew ? EMPTY : { ...EMPTY, ...garantia })
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([])
  const [produtos, setProdutos] = useState<{ id: number; nome: string }[]>([])

  useEffect(() => {
    supabase.from('clientes').select('id, nome').order('nome').then(({ data }) => setClientes(data ?? []))
    supabase.from('produtos').select('id, nome').order('nome').then(({ data }) => setProdutos(data ?? []))
  }, [])

  function set(field: keyof Garantia, value: string | boolean | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function salvar() {
    setSaving(true)
    const { clientes: _c, produtos: _p, ...payload } = form as any
    const data = {
      ...payload,
      tipo: 'garantia',
      protocolo: payload.protocolo || `GAR-${Date.now().toString().slice(-6)}`,
    }

    if (isNew) {
      const { error } = await supabase.from('garantias_assistencias').insert(data)
      if (error) { toast.error('Erro ao criar protocolo'); setSaving(false); return }
      toast.success('Protocolo criado!')
    } else {
      const { error } = await supabase.from('garantias_assistencias').update(data).eq('id', garantia!.id!)
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
      toast.success('Salvo!')
    }
    router.refresh()
    onClose()
  }

  const statusLabel = STATUS_OPTIONS.find(s => s.value === form.status)?.label ?? form.status ?? '—'
  const statusColors: Record<string, string> = {
    em_analise: '#F59E0B', aprovado: '#3B7DE8', em_reparo: '#8B5CF6',
    concluido: '#22C55E', entregue: '#5C6E84', recusado: '#D7282F'
  }
  const statusColor = statusColors[form.status ?? ''] ?? '#5C6E84'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-[18px] border border-[#16212E]/[0.10]"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-[#1F2A39]">
                {isNew ? 'Novo Protocolo' : (form.protocolo ?? `Protocolo #${garantia?.id}`)}
              </h2>
              {!isNew && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
                  style={{ color: statusColor, backgroundColor: `${statusColor}18`, border: `1px solid ${statusColor}40` }}>
                  {statusLabel}
                </span>
              )}
            </div>
            {!isNew && garantia?.clientes?.nome && (
              <p className="text-[11px] text-[#9AA7B6] mt-0.5">{garantia.clientes.nome}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#16212E]/[0.06] text-[#9AA7B6] hover:text-[#56657A] transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Stats (só existente) */}
        {!isNew && (
          <div className="grid grid-cols-3 gap-2 px-6 pb-4 shrink-0">
            {[
              { label: 'Entrada',  value: new Date(garantia?.data_entrada ?? garantia?.created_at ?? '').toLocaleDateString('pt-BR') },
              { label: 'Prazo',    value: garantia?.dias_garantia_restantes != null ? `${garantia.dias_garantia_restantes}d` : '—' },
              { label: 'Orçamento',value: garantia?.orcamento_valor ? `R$ ${Number(garantia.orcamento_valor).toLocaleString('pt-BR')}` : '—' },
            ].map(s => (
              <div key={s.label} className="rounded-[13px] border border-[#16212E]/[0.08] p-3 text-center"
                style={{ backgroundColor: 'rgba(22,32,46,0.04)' }}>
                <div className="text-sm font-bold text-[#1F2A39] leading-tight">{s.value}</div>
                <div className="text-[9px] text-[#9AA7B6] tracking-widest uppercase font-mono mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Form */}
        <form onSubmit={e => { e.preventDefault(); salvar() }} className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Protocolo</label>
              <input value={form.protocolo ?? ''} onChange={e => set('protocolo', e.target.value)}
                className={inputCls} placeholder="GAR-000001" />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status ?? 'em_analise'} onChange={e => set('status', e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ backgroundColor: '#FFFFFF' }}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Cliente</label>
              <select value={form.cliente_id ?? ''} onChange={e => set('cliente_id', e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                <option value="" style={{ backgroundColor: '#FFFFFF' }}>Selecionar...</option>
                {clientes.map(c => <option key={c.id} value={c.id} style={{ backgroundColor: '#FFFFFF' }}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Produto</label>
              <select value={form.produto_id ?? ''} onChange={e => set('produto_id', e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                <option value="" style={{ backgroundColor: '#FFFFFF' }}>Selecionar...</option>
                {produtos.map(p => <option key={p.id} value={p.id} style={{ backgroundColor: '#FFFFFF' }}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>IMEI / Nº de série</label>
              <input value={form.imei_serial ?? ''} onChange={e => set('imei_serial', e.target.value)}
                className={inputCls} placeholder="358000000000000" />
            </div>
            <div>
              <label className={labelCls}>Data de entrada</label>
              <input value={form.data_entrada ?? ''} onChange={e => set('data_entrada', e.target.value)}
                type="date" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Dias de garantia restantes</label>
              <input value={form.dias_garantia_restantes ?? ''} onChange={e => set('dias_garantia_restantes', e.target.value ? Number(e.target.value) : null)}
                type="number" className={inputCls} placeholder="365" />
            </div>
            <div>
              <label className={labelCls}>Orçamento (R$)</label>
              <input value={form.orcamento_valor ?? ''} onChange={e => set('orcamento_valor', e.target.value ? Number(e.target.value) : null)}
                type="number" className={inputCls} placeholder="0,00" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Estado de entrada</label>
            <input value={form.estado_entrada ?? ''} onChange={e => set('estado_entrada', e.target.value)}
              className={inputCls} placeholder="Ex: Tela trincada, sem carregador..." />
          </div>

          <div>
            <label className={labelCls}>Defeito relatado pelo cliente</label>
            <textarea value={form.defeito_relatado ?? ''} onChange={e => set('defeito_relatado', e.target.value)}
              rows={2} className={inputCls + ' resize-none'} placeholder="Descreva o problema..." />
          </div>

          <div>
            <label className={labelCls}>Parecer técnico</label>
            <textarea value={form.parecer_tecnico ?? ''} onChange={e => set('parecer_tecnico', e.target.value)}
              rows={2} className={inputCls + ' resize-none'} placeholder="Diagnóstico técnico..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Celular reserva</label>
              <select value={form.celular_reserva_fornecido ? 'sim' : 'nao'} onChange={e => set('celular_reserva_fornecido', e.target.value === 'sim')} className={inputCls}>
                <option value="nao" style={{ backgroundColor: '#FFFFFF' }}>Não fornecido</option>
                <option value="sim" style={{ backgroundColor: '#FFFFFF' }}>Fornecido</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Modelo reserva</label>
              <input value={form.modelo_reserva ?? ''} onChange={e => set('modelo_reserva', e.target.value)}
                className={inputCls} placeholder="Ex: iPhone 11" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Observações</label>
            <textarea value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)}
              rows={2} className={inputCls + ' resize-none'} placeholder="Observações adicionais..." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#16212E]/[0.08] shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#9AA7B6] hover:text-[#56657A] font-medium transition-colors">
            Fechar
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-[#D7282F] hover:bg-[#C01F26] disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        </form>
      </div>
    </div>
  )
}
