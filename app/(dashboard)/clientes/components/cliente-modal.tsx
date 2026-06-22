'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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
  const colors = [
    '#D7282F', '#3B7DE8', '#22C55E', '#F59E0B',
    '#8B5CF6', '#EC4899', '#06B6D4', '#10B981',
    '#F97316', '#6366F1',
  ]
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

// Input / Select / Textarea com estilo unificado dark
const inputCls = "w-full bg-[#0D1824] border border-white/[0.08] rounded-[10px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-[#D7282F]/40 transition-colors"
const labelCls = "block text-[10px] font-mono tracking-[0.15em] text-[#3F516A] uppercase mb-1.5"

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
    const { total_vendas, valor_total, ultima_compra, ...payload } = form
    const data = { ...payload, ativo: true }

    if (isNew) {
      const { error } = await supabase.from('clientes').insert(data)
      if (error) { toast.error('Erro ao cadastrar'); setSaving(false); return }
      toast.success('Cliente cadastrado!')
    } else {
      const { error } = await supabase.from('clientes').update(data).eq('id', cliente!.id!)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0D1824] border border-white/[0.08] rounded-[20px] w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 pt-6 pb-5 shrink-0">
          <div
            className="w-11 h-11 rounded-[12px] flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: color }}
          >
            {getInitials(form.nome || 'CL')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#F4F6F9] truncate">
                {isNew ? 'Novo Cliente' : (form.nome || 'Cliente')}
              </h2>
              {form.tipo_cliente === 'VIP' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-[#F59E0B]/40 text-[#F59E0B] bg-[#F59E0B]/10 shrink-0">
                  VIP
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/[0.06] text-[#5C6E84] hover:text-[#D4DEEA] transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats (só para cliente existente) */}
        {!isNew && (
          <div className="grid grid-cols-3 gap-3 px-6 pb-5 shrink-0">
            <div className="bg-[#0A111E] border border-white/[0.06] rounded-[12px] p-3 text-center">
              <div className="text-xl font-bold text-[#F4F6F9] font-mono">{tv}</div>
              <div className="text-[10px] text-[#5C6E84] tracking-wide uppercase font-mono mt-0.5">compras</div>
            </div>
            <div className="bg-[#0A111E] border border-white/[0.06] rounded-[12px] p-3 text-center">
              <div className="text-base font-bold text-[#22C55E]">{vt > 0 ? fmtBRL(vt) : '—'}</div>
              <div className="text-[10px] text-[#5C6E84] tracking-wide uppercase font-mono mt-0.5">total gasto</div>
            </div>
            <div className="bg-[#0A111E] border border-white/[0.06] rounded-[12px] p-3 text-center">
              <div className="text-base font-bold text-[#F4F6F9]">{fmtUltima(uc)}</div>
              <div className="text-[10px] text-[#5C6E84] tracking-wide uppercase font-mono mt-0.5">última compra</div>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
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
                {['Novo', 'Ativo', 'VIP', 'Recorrente', 'Inativo'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Estado civil</label>
              <select value={form.estado_civil ?? ''} onChange={e => set('estado_civil', e.target.value)} className={inputCls}>
                <option value="">—</option>
                {['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'].map(t => <option key={t}>{t}</option>)}
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
                <option value="">—</option>
                {['Instagram', 'WhatsApp', 'Indicação', 'Loja física', 'Facebook', 'Google', 'Marketplace'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>CEP</label>
            <input value={form.cep ?? ''} onChange={e => set('cep', e.target.value)} className={inputCls} placeholder="00000-000" />
          </div>
          <div>
            <label className={labelCls}>Endereço (Rua / Av.)</label>
            <input value={form.endereco ?? ''} onChange={e => set('endereco', e.target.value)} className={inputCls} placeholder="Rua..." />
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
              <input value={form.bairro ?? ''} onChange={e => set('bairro', e.target.value)} className={inputCls} placeholder="Bairro" />
            </div>
            <div>
              <label className={labelCls}>Cidade</label>
              <input value={form.cidade ?? ''} onChange={e => set('cidade', e.target.value)} className={inputCls} placeholder="São Paulo" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Estado (UF)</label>
            <input value={form.estado ?? ''} onChange={e => set('estado', e.target.value)} className={inputCls} placeholder="SP" maxLength={2} />
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea
              value={form.observacoes ?? ''}
              onChange={e => set('observacoes', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
              placeholder="Anotações sobre o cliente..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] shrink-0">
          {!isNew ? (
            <button onClick={excluir} className="text-[#D7282F] hover:text-red-400 text-sm font-semibold transition-colors">
              Desativar
            </button>
          ) : <div />}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#5C6E84] hover:text-[#D4DEEA] font-semibold transition-colors">
              Fechar
            </button>
            <button
              onClick={salvar}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#D7282F] hover:bg-[#C0232A] disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
