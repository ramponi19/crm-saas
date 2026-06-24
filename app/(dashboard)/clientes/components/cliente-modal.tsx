'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { TablesInsert, TablesUpdate } from '@/types/database'

interface Cliente {
  id?: number
  nome: string
  email: string | null
  telefone: string | null
  cpf_cnpj: string | null
  data_nascimento: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  tipo_cliente: string | null
  instagram: string | null
  origem_cliente: string | null
  observacoes: string | null
  estado_civil: string | null
  profissao: string | null
  nacionalidade: string | null
  ativo?: boolean | null
  total_vendas?: number
  valor_total?: number
  ultima_compra?: string | null
}

interface Props {
  cliente: Cliente | null
  isNew: boolean
  onClose: () => void
}

const EMPTY: Cliente = {
  nome: '', email: null, telefone: null, cpf_cnpj: null, data_nascimento: null,
  endereco: null, numero: null, complemento: null, bairro: null, cidade: null,
  estado: null, cep: null, tipo_cliente: 'Novo', instagram: null,
  origem_cliente: null, observacoes: null, estado_civil: null,
  profissao: null, nacionalidade: 'Brasileiro(a)',
}

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || 'CL'
}

function avatarColor(name: string): string {
  const colors = ['#D7282F','#3B7DE8','#22C55E','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#10B981','#F97316','#6366F1']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtUltima(d: string | null | undefined) {
  if (!d) return '—'
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return `${diff} dias`
  return new Date(d).toLocaleDateString('pt-BR')
}

// Cores extraídas diretamente do DOM do modelo:
// Card:   #FFFFFF  (rgb 14,26,44)
// Input:  #FFFFFF  (rgb 18,32,54) + border rgba(255,255,255,0.08)
// Label:  #4F6178  (rgb 79,97,120) — 9.5px uppercase mono
// Text:   #E9EEF4  (rgb 233,238,244)
// Stats:  rgba(22,32,46,0.04) bg + rgba(255,255,255,0.06) border + 13px radius

const inputCls = [
  'w-full rounded-[10px] px-3 py-2.5 text-sm outline-none transition-colors',
  'text-[#1F2A39] placeholder:text-[#9AA7B6]',
  'bg-white border border-[#16212E]/[0.10] focus:border-[#16212E]/20',
].join(' ')

const labelCls = 'block text-[9.5px] font-mono tracking-[0.15em] text-[#9AA7B6] uppercase mb-1.5'

export default function ClienteModal({ cliente, isNew, onClose }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState<Cliente>(isNew ? EMPTY : { ...EMPTY, ...cliente })
  const [saving, setSaving] = useState(false)

  function set(field: keyof Cliente, value: string) {
    setForm(f => ({ ...f, [field]: value || null }))
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const { total_vendas: _tv, valor_total: _vt, ultima_compra: _uc, ...payload } = form
    const data = { ...payload, ativo: true }
    if (isNew) {
      const { error } = await supabase.from('clientes').insert(data as TablesInsert<'clientes'>)
      if (error) { toast.error('Erro ao cadastrar'); setSaving(false); return }
      toast.success('Cliente cadastrado!')
    } else {
      const { error } = await supabase.from('clientes').update(data as TablesUpdate<'clientes'>).eq('id', cliente!.id!)
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
      toast.success('Salvo!')
    }
    router.refresh()
    onClose()
  }

  async function excluir() {
    if (!confirm('Desativar este cliente?')) return
    await supabase.from('clientes').update({ ativo: false }).eq('id', cliente!.id!)
    toast.success('Cliente desativado')
    router.refresh()
    onClose()
  }

  const color = avatarColor(form.nome || 'CL')
  const tv = cliente?.total_vendas ?? 0
  const vt = cliente?.valor_total ?? 0
  const uc = cliente?.ultima_compra ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      {/* Card: #FFFFFF + border rgba(255,255,255,0.08) + radius 18px */}
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-[18px] border border-[#16212E]/[0.10]"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: color }}
          >
            {getInitials(form.nome || 'CL')}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1F2A39] truncate">
              {isNew ? 'Novo Cliente' : (form.nome || 'Cliente')}
            </h2>
            {!isNew && form.ativo !== false && form.tipo_cliente !== 'VIP' && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-[#15986A] bg-[#22C55E]/10 border border-[#22C55E]/20 shrink-0">
                Ativo
              </span>
            )}
            {form.tipo_cliente === 'VIP' && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-[#F59E0B]/40 text-[#B47B12] bg-[#F59E0B]/10 shrink-0">
                VIP
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#16212E]/[0.06] text-[#9AA7B6] hover:text-[#56657A] transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Stats — rgba(22,32,46,0.04) bg, radius 13px */}
        {!isNew && (
          <div className="grid grid-cols-3 gap-2 px-6 pb-4 shrink-0">
            <div className="rounded-[13px] border border-[#16212E]/[0.08] p-3 text-center" style={{ backgroundColor: 'rgba(22,32,46,0.04)' }}>
              <div className="text-lg font-bold text-[#16212E] font-mono">{tv}</div>
              <div className="text-[9px] text-[#9AA7B6] tracking-widest uppercase font-mono mt-0.5">compras</div>
            </div>
            <div className="rounded-[13px] border border-[#16212E]/[0.08] p-3 text-center" style={{ backgroundColor: 'rgba(22,32,46,0.04)' }}>
              <div className="text-sm font-bold text-[#15986A] leading-tight">{vt > 0 ? fmtBRL(vt) : '—'}</div>
              <div className="text-[9px] text-[#9AA7B6] tracking-widest uppercase font-mono mt-0.5">total gasto</div>
            </div>
            <div className="rounded-[13px] border border-[#16212E]/[0.08] p-3 text-center" style={{ backgroundColor: 'rgba(22,32,46,0.04)' }}>
              <div className="text-sm font-bold text-[#1F2A39] leading-tight">{fmtUltima(uc)}</div>
              <div className="text-[9px] text-[#9AA7B6] tracking-widest uppercase font-mono mt-0.5">última compra</div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={e => { e.preventDefault(); salvar() }} className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-3">
          <div>
            <label className={labelCls}>Nome completo</label>
            <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls} placeholder="Nome completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Telefone / WhatsApp</label>
              <input value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value)} className={inputCls} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input value={form.email ?? ''} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="email@exemplo.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>CPF / CNPJ</label>
              <input value={form.cpf_cnpj ?? ''} onChange={e => set('cpf_cnpj', e.target.value)} className={inputCls} placeholder="000.000.000-00" />
            </div>
            <div>
              <label className={labelCls}>Data de nascimento</label>
              <input value={form.data_nascimento ?? ''} onChange={e => set('data_nascimento', e.target.value)} type="date" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo de cliente</label>
              <select value={form.tipo_cliente ?? 'Novo'} onChange={e => set('tipo_cliente', e.target.value)} className={inputCls}>
                {['Novo','Ativo','VIP','Recorrente','Inativo'].map(t => <option key={t} style={{ backgroundColor: '#FFFFFF' }}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Estado civil</label>
              <select value={form.estado_civil ?? ''} onChange={e => set('estado_civil', e.target.value)} className={inputCls}>
                <option value="" style={{ backgroundColor: '#FFFFFF' }}>Solteiro(a), Casado(a)...</option>
                {['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União estável'].map(t => <option key={t} style={{ backgroundColor: '#FFFFFF' }}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Profissão</label>
              <input value={form.profissao ?? ''} onChange={e => set('profissao', e.target.value)} className={inputCls} placeholder="Ex: Comerciante" />
            </div>
            <div>
              <label className={labelCls}>Nacionalidade</label>
              <input value={form.nacionalidade ?? ''} onChange={e => set('nacionalidade', e.target.value)} className={inputCls} placeholder="Brasileiro(a)" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Instagram</label>
              <input value={form.instagram ?? ''} onChange={e => set('instagram', e.target.value)} className={inputCls} placeholder="@usuario" />
            </div>
            <div>
              <label className={labelCls}>Origem do cliente</label>
              <select value={form.origem_cliente ?? ''} onChange={e => set('origem_cliente', e.target.value)} className={inputCls}>
                <option value="" style={{ backgroundColor: '#FFFFFF' }}>—</option>
                {['Instagram','WhatsApp','Indicação','Loja física','Facebook','Google','Marketplace'].map(t => <option key={t} style={{ backgroundColor: '#FFFFFF' }}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>CEP</label>
            <input value={form.cep ?? ''} onChange={e => set('cep', e.target.value)} className={inputCls} placeholder="00000-000" />
          </div>
          <div>
            <label className={labelCls}>Endereço (Rua / Av.)</label>
            <input value={form.endereco ?? ''} onChange={e => set('endereco', e.target.value)} className={inputCls} placeholder="" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nº</label>
              <input value={form.numero ?? ''} onChange={e => set('numero', e.target.value)} className={inputCls} placeholder="123" />
            </div>
            <div>
              <label className={labelCls}>Complemento</label>
              <input value={form.complemento ?? ''} onChange={e => set('complemento', e.target.value)} className={inputCls} placeholder="Apto, bloco..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Bairro</label>
              <input value={form.bairro ?? ''} onChange={e => set('bairro', e.target.value)} className={inputCls} placeholder="" />
            </div>
            <div>
              <label className={labelCls}>Cidade</label>
              <input value={form.cidade ?? ''} onChange={e => set('cidade', e.target.value)} className={inputCls} placeholder="" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Estado (UF)</label>
            <input value={form.estado ?? ''} onChange={e => set('estado', e.target.value)} className={inputCls} placeholder="" maxLength={2} />
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} rows={3}
              className={inputCls + ' resize-none'} placeholder="Anotações sobre o cliente..." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#16212E]/[0.08] shrink-0">
          {!isNew ? (
            <button type="button" onClick={excluir} className="text-[#D7282F] hover:text-red-400 text-sm font-medium transition-colors">
              Desativar
            </button>
          ) : <div />}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#9AA7B6] hover:text-[#56657A] font-medium transition-colors">
              Fechar
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#D7282F] hover:bg-[#C01F26] disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
        </form>
      </div>
    </div>
  )
}
