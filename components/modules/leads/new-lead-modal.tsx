'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Lead, Usuario, KANBAN_COLUMNS } from './types'
import { toast } from 'sonner'

interface NewLeadModalProps {
  usuarios: Usuario[]
  onClose: () => void
  onCreate: (lead: Lead) => void
}

export function NewLeadModal({ usuarios, onClose, onCreate }: NewLeadModalProps) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    instagram: '',
    origem: '',
    produto_interessado: '',
    kanban_status: 'novo' as const,
    responsavel_id: '',
    observacoes: '',
  })

  const origens = ['WhatsApp', 'Instagram', 'Indicação', 'Site', 'Balcão', 'Facebook', 'Google']

  function handleChange(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('leads')
      .insert({
        nome: form.nome.trim(),
        telefone: form.telefone.trim() || null,
        instagram: form.instagram.trim() || null,
        origem: form.origem || null,
        produto_interessado: form.produto_interessado.trim() || null,
        kanban_status: form.kanban_status,
        responsavel_id: form.responsavel_id || null,
        observacoes: form.observacoes.trim() || null,
        ativo: true,
        msgs_nao_lidas: 0,
      })
      .select()
      .single()

    if (error) {
      toast.error('Erro ao criar lead')
      setLoading(false)
      return
    }

    toast.success('Lead criado')
    onCreate(data as Lead)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg bg-[hsl(var(--background))] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[hsl(var(--crm-border))]">
          <h2 className="font-fraunces text-xl font-medium text-[hsl(var(--crm-text-primary))]">
            Novo Lead
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-subtle))] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Nome *
              </label>
              <input
                type="text"
                value={form.nome}
                onChange={e => handleChange('nome', e.target.value)}
                placeholder="Nome do lead"
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={form.telefone}
                onChange={e => handleChange('telefone', e.target.value)}
                placeholder="(19) 99999-0000"
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Instagram
              </label>
              <input
                type="text"
                value={form.instagram}
                onChange={e => handleChange('instagram', e.target.value)}
                placeholder="@usuario"
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Origem
              </label>
              <select
                value={form.origem}
                onChange={e => handleChange('origem', e.target.value)}
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
              >
                <option value="">Selecionar</option>
                {origens.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Status inicial
              </label>
              <select
                value={form.kanban_status}
                onChange={e => handleChange('kanban_status', e.target.value)}
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
              >
                {KANBAN_COLUMNS.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Produto de interesse
              </label>
              <input
                type="text"
                value={form.produto_interessado}
                onChange={e => handleChange('produto_interessado', e.target.value)}
                placeholder="iPhone 15 Pro, MacBook Air..."
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Responsável
              </label>
              <select
                value={form.responsavel_id}
                onChange={e => handleChange('responsavel_id', e.target.value)}
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
              >
                <option value="">Sem responsável</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
                Observações
              </label>
              <textarea
                value={form.observacoes}
                onChange={e => handleChange('observacoes', e.target.value)}
                rows={3}
                placeholder="Contexto, anotações importantes..."
                className="mt-1 w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[hsl(var(--crm-border))]">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[hsl(var(--crm-border))] text-sm font-medium text-[hsl(var(--crm-text-muted))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.nome.trim()}
            className="flex-1 py-2.5 rounded-lg bg-[hsl(var(--crm-brand))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Criando...' : 'Criar Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
