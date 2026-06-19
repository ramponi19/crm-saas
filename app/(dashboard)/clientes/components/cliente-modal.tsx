'use client'

import { useState } from 'react'
import { X, Save, Trash2, Phone, Mail, MapPin, User, CreditCard } from 'lucide-react'
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
}

interface Props {
  cliente: Cliente | null
  isNew: boolean
  onClose: () => void
}

const EMPTY: Cliente = {
  nome: '', email: null, telefone: null, cpf_cnpj: null, data_nascimento: null,
  endereco: null, numero: null, complemento: null, bairro: null, cidade: null,
  estado: null, cep: null, tipo_cliente: null, instagram: null,
  origem_cliente: null, observacoes: null, estado_civil: null, profissao: null, nacionalidade: null,
}

export default function ClienteModal({ cliente, isNew, onClose }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState<Cliente>(isNew ? EMPTY : { ...EMPTY, ...cliente })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'dados' | 'endereco' | 'extra'>('dados')

  function set(field: keyof Cliente, value: string) {
    setForm(f => ({ ...f, [field]: value || null }))
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const payload = { ...form, ativo: true }

    if (isNew) {
      const { error } = await supabase.from('clientes').insert(payload)
      if (error) { toast.error('Erro ao cadastrar cliente'); setSaving(false); return }
      toast.success('Cliente cadastrado!')
    } else {
      const { error } = await supabase.from('clientes').update(payload).eq('id', cliente!.id!)
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
      toast.success('Cliente atualizado!')
    }
    router.refresh()
    onClose()
  }

  async function excluir() {
    if (!confirm('Desativar este cliente?')) return
    await supabase.from('clientes').update({ ativo: false }).eq('id', cliente!.id!)
    toast.success('Cliente removido')
    router.refresh()
    onClose()
  }

  const Input = ({ label, field, placeholder, type = 'text' }: { label: string; field: keyof Cliente; placeholder?: string; type?: string }) => (
    <div>
      <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">{label}</label>
      <input
        type={type}
        value={(form[field] as string) ?? ''}
        onChange={e => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2] transition-colors"
      />
    </div>
  )

  const Select = ({ label, field, options }: { label: string; field: keyof Cliente; options: string[] }) => (
    <div>
      <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">{label}</label>
      <select
        value={(form[field] as string) ?? ''}
        onChange={e => set(field, e.target.value)}
        className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/[0.2] transition-colors"
      >
        <option value="">Selecionar...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[600px] max-h-[85vh] bg-[#0D1824] border border-white/[0.08] rounded-[20px] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#F4F6F9]">
              {isNew ? 'Novo Cliente' : form.nome || 'Cliente'}
            </h2>
            {!isNew && <p className="text-xs text-[#5C6E84] mt-0.5">Editar cadastro</p>}
          </div>
          <button onClick={onClose} className="text-[#5C6E84] hover:text-[#9FB0C2] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {[
            { key: 'dados', label: 'Dados Pessoais', icon: User },
            { key: 'endereco', label: 'Endereço', icon: MapPin },
            { key: 'extra', label: 'Complementar', icon: CreditCard },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-medium transition-all ${
                tab === t.key
                  ? 'bg-[rgba(215,40,47,0.12)] text-[#F0353D]'
                  : 'text-[#5C6E84] hover:text-[#8A9BB0]'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'dados' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Input label="Nome Completo *" field="nome" placeholder="Nome do cliente" />
              </div>
              <Input label="Telefone / WhatsApp" field="telefone" placeholder="(11) 99999-9999" />
              <Input label="E-mail" field="email" type="email" placeholder="email@exemplo.com" />
              <Input label="CPF / CNPJ" field="cpf_cnpj" placeholder="000.000.000-00" />
              <Input label="Data de Nascimento" field="data_nascimento" type="date" />
              <Input label="Instagram" field="instagram" placeholder="@usuario" />
              <Select label="Tipo de Cliente" field="tipo_cliente" options={['Pessoa Física', 'Pessoa Jurídica', 'Revendedor']} />
              <Select label="Origem" field="origem_cliente" options={['Instagram', 'WhatsApp', 'Indicação', 'Google', 'Walk-in', 'Outro']} />
            </div>
          )}

          {tab === 'endereco' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="CEP" field="cep" placeholder="00000-000" />
              <Input label="Estado" field="estado" placeholder="SP" />
              <div className="col-span-2">
                <Input label="Endereço" field="endereco" placeholder="Rua, Avenida..." />
              </div>
              <Input label="Número" field="numero" placeholder="123" />
              <Input label="Complemento" field="complemento" placeholder="Apto, Bloco..." />
              <Input label="Bairro" field="bairro" placeholder="Bairro" />
              <Input label="Cidade" field="cidade" placeholder="Cidade" />
            </div>
          )}

          {tab === 'extra' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Profissão" field="profissao" placeholder="Profissão" />
              <Select label="Estado Civil" field="estado_civil" options={['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável']} />
              <Input label="Nacionalidade" field="nacionalidade" placeholder="Brasileiro" />
              <div className="col-span-2">
                <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Observações</label>
                <textarea
                  value={form.observacoes ?? ''}
                  onChange={e => set('observacoes', e.target.value)}
                  rows={4}
                  placeholder="Anotações sobre o cliente..."
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2] resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] shrink-0">
          {!isNew ? (
            <button onClick={excluir} className="flex items-center gap-2 text-xs text-[#5C6E84] hover:text-[#F0353D] transition-colors">
              <Trash2 size={14} />
              Excluir
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-[9px] text-sm text-[#5C6E84] hover:text-[#D4DEEA] transition-colors">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
