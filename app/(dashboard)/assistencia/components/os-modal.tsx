'use client'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface OS {
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
  created_at?: string
  observacoes: string | null
  estado_entrada: string | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  cliente_id: number | null
  produto_id: number | null
  clientes?: { nome: string; telefone: string | null } | null
  produtos?: { nome: string } | null
}
interface Props { os: OS | null; isNew: boolean; onClose: () => void }

const EMPTY: OS = {
  protocolo: null, tipo: 'assistencia', status: 'em_analise',
  defeito_relatado: null, parecer_tecnico: null, orcamento_valor: null,
  imei_serial: null, dentro_garantia: false, dias_garantia_restantes: null,
  data_entrada: new Date().toISOString().split('T')[0], observacoes: null,
  estado_entrada: null, celular_reserva_fornecido: false, modelo_reserva: null,
  cliente_id: null, produto_id: null,
}

const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-sm text-[#E9EEF4] placeholder:text-[#4F6178] bg-[#122036] border border-white/[0.08] focus:border-white/20 outline-none transition-colors'
const labelCls = 'block text-[9.5px] font-mono tracking-[0.15em] text-[#4F6178] uppercase mb-1.5'

const STATUS_OPTIONS = [
  { value: 'em_analise', label: 'Em análise' },
  { value: 'em_reparo', label: 'Em reparo' },
  { value: 'aguardando_peca', label: 'Aguardando peça' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'reprovado', label: 'Reprovado' },
]

export default function OSModal({ os, isNew, onClose }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState<OS>(isNew ? EMPTY : { ...EMPTY, ...os })
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([])
  const [produtos, setProdutos] = useState<{ id: number; nome: string }[]>([])

  useEffect(() => {
    supabase.from('clientes').select('id, nome').order('nome').then(({ data }) => setClientes(data ?? []))
    supabase.from('produtos').select('id, nome').order('nome').then(({ data }) => setProdutos(data ?? []))
  }, [])

  function set(field: keyof OS, value: string | boolean | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function salvar() {
    setSaving(true)
    const { clientes: _c, produtos: _p, ...payload } = form as any
    const data = { ...payload, tipo: 'assistencia', protocolo: payload.protocolo || `OS-${Date.now().toString().slice(-6)}` }
    if (isNew) {
      const { error } = await supabase.from('garantias_assistencias').insert(data)
      if (error) { toast.error('Erro ao criar OS'); setSaving(false); return }
      toast.success('OS criada!')
    } else {
      const { error } = await supabase.from('garantias_assistencias').update(data).eq('id', os!.id!)
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
      toast.success('Salvo!')
    }
    router.refresh(); onClose()
  }

  const statusColors: Record<string, string> = {
    em_analise: '#F59E0B', em_reparo: '#8B5CF6', aguardando_peca: '#3B7DE8',
    concluido: '#22C55E', entregue: '#5C6E84', reprovado: '#D7282F'
  }
  const sc = statusColors[form.status ?? ''] ?? '#5C6E84'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-[18px] border border-white/[0.08]" style={{ backgroundColor: '#0E1A2C' }}>
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[#E9EEF4]">{isNew ? 'Nova OS' : (form.protocolo ?? `OS #${os?.id}`)}</h2>
              {!isNew && <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ color: sc, backgroundColor: `${sc}18`, border: `1px solid ${sc}40` }}>{STATUS_OPTIONS.find(s => s.value === form.status)?.label}</span>}
            </div>
            {!isNew && os?.clientes?.nome && <p className="text-[11px] text-[#4F6178] mt-0.5">{os.clientes.nome}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#4F6178] hover:text-[#D4DEEA] transition-colors"><X size={16} /></button>
        </div>

        {!isNew && (
          <div className="grid grid-cols-3 gap-2 px-6 pb-4 shrink-0">
            {[
              { label: 'Entrada', value: new Date(os?.data_entrada ?? os?.created_at ?? '').toLocaleDateString('pt-BR') },
              { label: 'Orçamento', value: os?.orcamento_valor ? `R$ ${Number(os.orcamento_valor).toLocaleString('pt-BR')}` : '—' },
              { label: 'Aparelho', value: os?.produtos?.nome ?? '—' },
            ].map(s => (
              <div key={s.label} className="rounded-[13px] border border-white/[0.06] p-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <div className="text-sm font-bold text-[#E9EEF4] leading-tight truncate">{s.value}</div>
                <div className="text-[9px] text-[#4F6178] tracking-widest uppercase font-mono mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Nº OS</label><input value={form.protocolo ?? ''} onChange={e => set('protocolo', e.target.value)} className={inputCls} placeholder="OS-000001" /></div>
            <div><label className={labelCls}>Status</label>
              <select value={form.status ?? 'em_analise'} onChange={e => set('status', e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ backgroundColor: '#0E1A2C' }}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Cliente</label>
              <select value={form.cliente_id ?? ''} onChange={e => set('cliente_id', e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                <option value="" style={{ backgroundColor: '#0E1A2C' }}>Selecionar...</option>
                {clientes.map(c => <option key={c.id} value={c.id} style={{ backgroundColor: '#0E1A2C' }}>{c.nome}</option>)}
              </select>
            </div>
            <div><label className={labelCls}>Produto</label>
              <select value={form.produto_id ?? ''} onChange={e => set('produto_id', e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                <option value="" style={{ backgroundColor: '#0E1A2C' }}>Selecionar...</option>
                {produtos.map(p => <option key={p.id} value={p.id} style={{ backgroundColor: '#0E1A2C' }}>{p.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>IMEI / Nº série</label><input value={form.imei_serial ?? ''} onChange={e => set('imei_serial', e.target.value)} className={inputCls} placeholder="358000000000000" /></div>
            <div><label className={labelCls}>Data de entrada</label><input value={form.data_entrada ?? ''} onChange={e => set('data_entrada', e.target.value)} type="date" className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Origem</label>
              <select value={form.dentro_garantia ? 'garantia' : 'externo'} onChange={e => set('dentro_garantia', e.target.value === 'garantia')} className={inputCls}>
                <option value="externo" style={{ backgroundColor: '#0E1A2C' }}>Reparo externo</option>
                <option value="garantia" style={{ backgroundColor: '#0E1A2C' }}>Garantia</option>
              </select>
            </div>
            <div><label className={labelCls}>Orçamento (R$)</label><input value={form.orcamento_valor ?? ''} onChange={e => set('orcamento_valor', e.target.value ? Number(e.target.value) : null)} type="number" className={inputCls} placeholder="0,00" /></div>
          </div>
          <div><label className={labelCls}>Estado de entrada</label><input value={form.estado_entrada ?? ''} onChange={e => set('estado_entrada', e.target.value)} className={inputCls} placeholder="Ex: Tela trincada..." /></div>
          <div><label className={labelCls}>Defeito relatado</label><textarea value={form.defeito_relatado ?? ''} onChange={e => set('defeito_relatado', e.target.value)} rows={2} className={inputCls + ' resize-none'} placeholder="Descreva o problema..." /></div>
          <div><label className={labelCls}>Parecer técnico</label><textarea value={form.parecer_tecnico ?? ''} onChange={e => set('parecer_tecnico', e.target.value)} rows={2} className={inputCls + ' resize-none'} placeholder="Diagnóstico..." /></div>
          <div><label className={labelCls}>Observações</label><textarea value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} rows={2} className={inputCls + ' resize-none'} placeholder="..." /></div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#4F6178] hover:text-[#D4DEEA] font-medium transition-colors">Fechar</button>
          <button onClick={salvar} disabled={saving} className="px-5 py-2 bg-[#D7282F] hover:bg-[#C0232A] disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
