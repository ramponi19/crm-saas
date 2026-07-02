'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, Pencil, Trash2, X, Loader2, KeyRound, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Tables } from '@/types/database'

type Proprietario = Tables<'proprietarios'>

const vazio = { nome: '', cpf_cnpj: '', telefone: '', email: '', observacoes: '' }

export default function ProprietariosView({ inicial, empresaId }: { inicial: Proprietario[]; empresaId: number }) {
  const supabase = createClient()
  const [lista, setLista] = useState<Proprietario[]>(inicial)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Proprietario | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(vazio)

  const set = (k: keyof typeof vazio, v: string) => setForm(f => ({ ...f, [k]: v }))

  function abrirNovo() { setEditando(null); setForm(vazio); setModal(true) }
  function abrirEdit(p: Proprietario) {
    setEditando(p)
    setForm({ nome: p.nome, cpf_cnpj: p.cpf_cnpj ?? '', telefone: p.telefone ?? '', email: p.email ?? '', observacoes: p.observacoes ?? '' })
    setModal(true)
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error('Informe o nome'); return }
    setLoading(true)
    const payload = {
      nome: form.nome.trim(),
      cpf_cnpj: form.cpf_cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      observacoes: form.observacoes || null,
    }
    if (editando) {
      const { data, error } = await supabase.from('proprietarios').update(payload).eq('id', editando.id).select('*').single()
      if (error) { toast.error(error.message); setLoading(false); return }
      setLista(l => l.map(x => (x.id === editando.id ? data : x)))
      toast.success('Proprietário atualizado')
    } else {
      const { data, error } = await supabase.from('proprietarios').insert({ ...payload, empresa_id: empresaId }).select('*').single()
      if (error) { toast.error(error.message); setLoading(false); return }
      setLista(l => [...l, data].sort((a, b) => a.nome.localeCompare(b.nome)))
      toast.success('Proprietário cadastrado')
    }
    setLoading(false); setModal(false)
  }

  async function excluir(p: Proprietario) {
    if (!confirm(`Excluir o proprietário "${p.nome}"?`)) return
    const { error } = await supabase.from('proprietarios').delete().eq('id', p.id)
    if (error) { toast.error(error.message); return }
    setLista(l => l.filter(x => x.id !== p.id))
    toast.success('Proprietário excluído')
  }

  const filtrada = lista.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.cpf_cnpj ?? '').includes(busca) ||
    (p.telefone ?? '').includes(busca)
  )

  const inputCls = 'w-full bg-[rgba(22,32,46,.04)] border border-[rgba(22,32,46,.12)] rounded-[10px] px-3 py-2.5 text-[14px] text-[#16212E] outline-none focus:border-[rgba(22,32,46,.35)] transition-colors'

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Proprietários" />

      <div className="p-6 max-w-[1100px]">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="relative flex-1 max-w-[360px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA7B6]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, telefone..." className={`${inputCls} pl-9`} />
          </div>
          <button onClick={abrirNovo} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] hover:bg-[#22303f] transition-colors shrink-0">
            <Plus size={17} /> Novo proprietário
          </button>
        </div>

        {filtrada.length === 0 ? (
          <div className="text-center py-20 text-[#788698]">
            <KeyRound size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-[14px]">Nenhum proprietário {busca ? 'encontrado' : 'cadastrado ainda'}.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[#16212E]/[0.07] text-left">
                  <th className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-5 py-3">Nome</th>
                  <th className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-5 py-3">CPF/CNPJ</th>
                  <th className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-5 py-3">Telefone</th>
                  <th className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-5 py-3">E-mail</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map(p => (
                  <tr key={p.id} className="border-b border-[#16212E]/[0.05] last:border-0 hover:bg-[#16212E]/[0.015]">
                    <td className="px-5 py-3 font-semibold text-[#16212E]">{p.nome}</td>
                    <td className="px-5 py-3 text-[#56657A]">{p.cpf_cnpj || '—'}</td>
                    <td className="px-5 py-3 text-[#56657A]">{p.telefone || '—'}</td>
                    <td className="px-5 py-3 text-[#56657A]">{p.email || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEdit(p)} className="p-2 rounded-[8px] text-[#788698] hover:bg-[#16212E]/[0.06] hover:text-[#16212E]" aria-label="Editar"><Pencil size={15} /></button>
                        <button onClick={() => excluir(p)} className="p-2 rounded-[8px] text-[#788698] hover:bg-[#DC2626]/[0.08] hover:text-[#DC2626]" aria-label="Excluir"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModal(false)}>
          <div className="bg-white rounded-[18px] w-full max-w-[460px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sans font-bold text-[17px] text-[#16212E]">{editando ? 'Editar proprietário' : 'Novo proprietário'}</h3>
              <button onClick={() => !loading && setModal(false)} className="text-[#9AA7B6] hover:text-[#16212E]" aria-label="Fechar"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5">NOME *</label>
                <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls} placeholder="Nome do proprietário" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5">CPF/CNPJ</label>
                  <input value={form.cpf_cnpj} onChange={e => set('cpf_cnpj', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5">TELEFONE</label>
                  <input value={form.telefone} onChange={e => set('telefone', e.target.value)} className={inputCls} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5">E-MAIL</label>
                <input value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5">OBSERVAÇÕES</label>
                <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2.5 mt-6">
              <button onClick={() => setModal(false)} disabled={loading} className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-[#788698] border border-[#16212E]/[0.1] hover:bg-[#16212E]/[0.03] disabled:opacity-60">Cancelar</button>
              <button onClick={salvar} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] hover:bg-[#22303f] disabled:opacity-60">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
