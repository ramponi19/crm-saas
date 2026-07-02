'use client'

import { useState, useEffect } from 'react'
import { X, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Lead, Usuario, type KanbanColumn } from './types'
import { toast } from 'sonner'
import type { TablesInsert } from '@/types/database'

interface NewLeadModalProps {
  usuarios: Usuario[]
  columns: KanbanColumn[]
  onClose: () => void
  onCreate: (lead: Lead) => void
}

const ORIGENS = [
  { value: 'whatsapp',  label: 'WhatsApp'  },
  { value: 'instagram', label: 'Instagram' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'site',      label: 'Site'      },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'manual',    label: 'Loja física' },
]

export function NewLeadModal({ usuarios, columns, onClose, onCreate }: NewLeadModalProps) {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const [form, setForm] = useState({
    nome: '', telefone: '', instagram: '', origem: '',
    produto_interessado: '', valor_estimado: '',
    kanban_status: 'novo' as const, responsavel_id: '', observacoes: '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function handleSubmit() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.origem) { toast.error('Selecione a origem do lead'); return }
    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Não autenticado'); setLoading(false); return }

    const { data: vinculo } = await supabase
      .from('empresa_usuarios')
      .select('empresa_id')
      .eq('usuario_id', user.id)
      .eq('ativo', true)
      .single()

    if (!vinculo) { toast.error('Empresa não encontrada'); setLoading(false); return }

    const { data: empresa } = await supabase
      .from('empresas').select('limite_leads').eq('id', vinculo.empresa_id).single()
    const { count: totalLeads } = await supabase
      .from('leads').select('*', { count: 'exact', head: true })
      .eq('empresa_id', vinculo.empresa_id).eq('ativo', true)
    const limiteLeads = empresa?.limite_leads ?? 0
    if (limiteLeads > 0 && (totalLeads ?? 0) >= limiteLeads) {
      toast.error(`Limite de leads atingido (${totalLeads}/${limiteLeads}). Faça upgrade para continuar.`)
      setLoading(false); return
    }

    const { data, error } = await supabase.from('leads').insert({
      empresa_id: vinculo.empresa_id,
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      instagram: form.instagram.trim() || null,
      origem: form.origem || null,
      produto_interessado: form.produto_interessado.trim() || null,
      valor_estimado: form.valor_estimado ? Number(form.valor_estimado.replace(',', '.')) : null,
      kanban_status: form.kanban_status,
      responsavel_id: form.responsavel_id || null,
      observacoes: form.observacoes.trim() || null,
      ativo: true, msgs_nao_lidas: 0,
    } as TablesInsert<'leads'>).select().single()

    if (error) {
      const msg = error.message?.includes('LEAD_LIMIT_REACHED')
        ? `Limite de leads atingido. Faça upgrade para continuar.`
        : 'Erro ao criar lead'
      toast.error(msg)
      setLoading(false)
      return
    }
    toast.success('Lead criado'); onCreate(data as Lead); setLoading(false)
  }

  const inputCls = "w-full bg-white/[0.04] border border-[#16212E]/[0.10] rounded-[10px] px-3 py-[10px] text-[13px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-[rgba(201,162,75,0.6)] transition-colors"
  const labelCls = "font-mono text-[10px] tracking-[0.12em] text-[#6B7C92] uppercase mb-[6px] block"

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      style={{ background: 'rgba(5,9,16,0.62)' }}>
      <div onClick={e => e.stopPropagation()}
        className="w-[480px] max-w-[94vw] max-h-[90vh] overflow-y-auto scrollbar-thin p-6 rounded-[18px]"
        style={{
          background: '#FFFFFF', border: '1px solid rgba(22,32,46,0.08)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)', animation: 'popIn 0.3s ease',
        }}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-[44px] h-[44px] rounded-[12px] bg-gradient-to-br from-[#22303F] to-[#16212E] flex items-center justify-center flex-none">
              <UserPlus size={22} className="text-white" />
            </div>
            <div>
              <h3 className="font-serif font-medium text-[21px] text-[#16212E]">Novo lead</h3>
              <div className="text-[12.5px] text-[#7E8EA2] mt-[2px]">Cadastre um novo contato no funil</div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-[34px] h-[34px] rounded-[9px] bg-white/[0.05] border border-[#16212E]/[0.10] text-[#9FB0C2] flex items-center justify-center flex-none hover:bg-[#16212E]/[0.04] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={e => { e.preventDefault(); handleSubmit() }}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Nome *</label>
            <input value={form.nome} onChange={e => set('nome', e.target.value)}
              placeholder="Nome do lead" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Telefone / WhatsApp</label>
            <input value={form.telefone} onChange={e => set('telefone', e.target.value)}
              placeholder="(19) 99999-0000" className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Instagram</label>
            <input value={form.instagram} onChange={e => set('instagram', e.target.value)}
              placeholder="@usuario" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Origem</label>
            <select value={form.origem} onChange={e => set('origem', e.target.value)}
              className={`${inputCls} cursor-pointer`}>
              <option value="" style={{ background: '#FFFFFF' }}>Selecionar</option>
              {ORIGENS.map(o => <option key={o.value} value={o.value} style={{ background: '#FFFFFF' }}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status inicial</label>
            <select value={form.kanban_status} onChange={e => set('kanban_status', e.target.value)}
              className={`${inputCls} cursor-pointer`}>
              {columns.map(c => <option key={c.id} value={c.id} style={{ background: '#FFFFFF' }}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Produto de interesse</label>
            <input value={form.produto_interessado} onChange={e => set('produto_interessado', e.target.value)}
              placeholder="iPhone 15 Pro…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Valor estimado (R$)</label>
            <input value={form.valor_estimado} onChange={e => set('valor_estimado', e.target.value.replace(/[^0-9.,]/g,''))}
              placeholder="0,00" className={`${inputCls} font-mono`} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Responsável</label>
            <select value={form.responsavel_id} onChange={e => set('responsavel_id', e.target.value)}
              className={`${inputCls} cursor-pointer`}>
              <option value="" style={{ background: '#FFFFFF' }}>Sem responsável</option>
              {usuarios.map(u => <option key={u.id} value={u.id} style={{ background: '#FFFFFF' }}>{u.nome}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Observações</label>
            <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
              rows={3} placeholder="Contexto, anotações…" className={`${inputCls} resize-none`} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="flex-1 py-[11px] rounded-[11px] border border-[#16212E]/[0.10] bg-white/[0.04] text-[#16212E] font-semibold text-[13.5px] hover:bg-[#16212E]/[0.06] transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={loading || !form.nome.trim()}
            className="flex-1 py-[11px] rounded-[11px] bg-gradient-to-b from-[#22303F] to-[#16212E] text-white font-semibold text-[13.5px] hover:-translate-y-[1px] transition-all disabled:opacity-40 disabled:transform-none shadow-[0_6px_18px_rgba(22,33,46,0.32)]">
            {loading ? 'Criando…' : 'Criar lead'}
          </button>
        </div>
        </form>
      </div>
    </div>
  )
}
