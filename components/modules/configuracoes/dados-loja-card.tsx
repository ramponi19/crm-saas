'use client'

import { useState, useEffect } from 'react'
import { Save, Store, MapPin, Phone, Mail, Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Json } from '@/types/database'

interface DadosLoja {
  nome: string
  cnpj: string
  telefone: string
  email: string
  endereco: string
  cidade: string
  estado: string
  site: string
  descricao: string
}

interface Props {
  config: DadosLoja | null
  onSaved: () => void
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function DadosLojaCard({ config, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState<DadosLoja>({
    nome:       config?.nome      ?? '',
    cnpj:       config?.cnpj      ?? '',
    telefone:   config?.telefone  ?? '',
    email:      config?.email     ?? '',
    endereco:   config?.endereco  ?? '',
    cidade:     config?.cidade    ?? '',
    estado:     config?.estado    ?? 'SP',
    site:       config?.site      ?? '',
    descricao:  config?.descricao ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [empresaId, setEmpresaId] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: vinculo } = await supabase
        .from('empresa_usuarios')
        .select('empresa_id')
        .eq('usuario_id', user.id)
        .eq('ativo', true)
        .single()
      if (vinculo) setEmpresaId(vinculo.empresa_id)
    })()
  }, [supabase])

  const set = (k: keyof DadosLoja, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function salvar() {
    if (!empresaId) { toast.error('Empresa não identificada'); return }
    setLoading(true)
    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert({ chave: 'dados_loja', valor: form as unknown as Json, empresa_id: empresaId }, { onConflict: 'empresa_id,chave' })
    setLoading(false)
    if (error) { toast.error('Erro ao salvar dados da loja'); return }
    toast.success('Dados da loja salvos')
    onSaved()
  }

  return (
    <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-[10px] bg-[rgba(107,140,255,0.12)] flex items-center justify-center">
          <Store size={16} className="text-[#6B8CFF]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#16212E]">Dados da loja</h3>
          <p className="text-xs text-[#788698]">Informações gerais do estabelecimento</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#788698] mb-1.5">Nome da loja</label>
            <input value={form.nome} onChange={e => set('nome', e.target.value)}
              placeholder="JM Store Importados"
              className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-white/20" />
          </div>
          <div>
            <label className="block text-xs text-[#788698] mb-1.5">CNPJ</label>
            <input value={form.cnpj} onChange={e => set('cnpj', e.target.value)}
              placeholder="00.000.000/0001-00"
              className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-white/20" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#788698] mb-1.5">Telefone</label>
            <input value={form.telefone} onChange={e => set('telefone', e.target.value)}
              placeholder="(19) 99999-9999"
              className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-white/20" />
          </div>
          <div>
            <label className="block text-xs text-[#788698] mb-1.5">E-mail</label>
            <input value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="contato@jmstore.com.br" type="email"
              className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-white/20" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#788698] mb-1.5">Endereço</label>
          <input value={form.endereco} onChange={e => set('endereco', e.target.value)}
            placeholder="Rua, número, bairro"
            className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-white/20" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#788698] mb-1.5">Cidade</label>
            <input value={form.cidade} onChange={e => set('cidade', e.target.value)}
              placeholder="Mogi Guaçu"
              className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-white/20" />
          </div>
          <div>
            <label className="block text-xs text-[#788698] mb-1.5">Estado</label>
            <select value={form.estado} onChange={e => set('estado', e.target.value)}
              className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] outline-none focus:border-white/20">
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-[#788698] mb-1.5">Site</label>
          <input value={form.site} onChange={e => set('site', e.target.value)}
            placeholder="https://jmstore.com.br"
            className="w-full bg-white border border-[#16212E]/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-white/20" />
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[#16212E]/[0.08] flex justify-end">
        <button
          onClick={salvar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {loading ? 'Salvando…' : 'Salvar dados'}
        </button>
      </div>
    </div>
  )
}
