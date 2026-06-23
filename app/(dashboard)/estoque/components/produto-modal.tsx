'use client'

import { useState } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Produto {
  id?: number
  nome: string
  marca_id: number | null
  categoria_id: number | null
}

interface Props {
  produto: Produto | null
  marcas: { id: number; nome: string }[]
  categorias: { id: number; nome: string }[]
  onClose: () => void
  onSaved: (p: Produto & { id: number; marca_nome: string; categoria_nome: string | null; ativo: boolean }) => void
  onDeleted?: (id: number) => void
}

export default function ProdutoModal({ produto, marcas, categorias, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const isNew = !produto?.id
  const [form, setForm] = useState({
    nome: produto?.nome ?? '',
    marca_id: produto?.marca_id ? String(produto.marca_id) : '',
    categoria_id: produto?.categoria_id ? String(produto.categoria_id) : '',
  })
  const [saving, setSaving] = useState(false)

  async function salvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.marca_id) { toast.error('Marca é obrigatória'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      marca_id: Number(form.marca_id),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      ativo: true,
    }
    if (isNew) {
      const { data, error } = await supabase.from('produtos').insert(payload).select().single()
      if (error) { toast.error('Erro: ' + error.message); setSaving(false); return }
      const marca = marcas.find(m => m.id === Number(form.marca_id))
      const cat = categorias.find(c => c.id === Number(form.categoria_id))
      toast.success('Produto cadastrado!')
      onSaved({ ...data, ativo: data.ativo ?? true, marca_nome: marca?.nome ?? '', categoria_nome: cat?.nome ?? null })
    } else {
      const { error } = await supabase.from('produtos').update(payload).eq('id', produto!.id!)
      if (error) { toast.error('Erro: ' + error.message); setSaving(false); return }
      const marca = marcas.find(m => m.id === Number(form.marca_id))
      const cat = categorias.find(c => c.id === Number(form.categoria_id))
      toast.success('Produto atualizado!')
      onSaved({ id: produto!.id!, ...payload, marca_nome: marca?.nome ?? '', categoria_nome: cat?.nome ?? null })
    }
    onClose()
  }

  async function excluir() {
    if (!confirm('Desativar este produto?')) return
    await supabase.from('produtos').update({ ativo: false }).eq('id', produto!.id!)
    toast.success('Produto removido')
    onDeleted?.(produto!.id!)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-[460px] bg-[#F0F2F5] border border-[#16212E]/[0.10] rounded-[20px] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#16212E]/[0.08]">
          <h2 className="text-base font-bold text-[#16212E]">{isNew ? 'Novo Produto' : 'Editar Produto'}</h2>
          <button onClick={onClose} className="text-[#788698] hover:text-[#9FB0C2]"><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">Nome do Modelo *</label>
            <input
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: iPhone 15 Pro Max"
              className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">Marca *</label>
            <select
              value={form.marca_id}
              onChange={e => setForm(f => ({ ...f, marca_id: e.target.value }))}
              className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] outline-none"
            >
              <option value="">Selecionar marca...</option>
              {marcas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">Categoria</label>
            <select
              value={form.categoria_id}
              onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
              className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] outline-none"
            >
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#16212E]/[0.08]">
          {!isNew ? (
            <button onClick={excluir} className="flex items-center gap-2 text-xs text-[#788698] hover:text-[#F0353D] transition-colors">
              <Trash2 size={14} />
              Remover
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-[9px] text-sm text-[#788698] hover:text-[#56657A]">Cancelar</button>
            <button
              onClick={salvar}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-sm font-semibold disabled:opacity-50"
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
