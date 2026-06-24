'use client'

import { useState, useEffect } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { TablesInsert, TablesUpdate } from '@/types/database'

interface Unidade {
  id?: number
  produto_id: number | null
  imei: string | null
  imei2: string | null
  numero_serie: string | null
  bateria: string | null
  condicao: string | null
  cor: string | null
  armazenamento: string | null
  preco_custo: number | null
  preco_venda: number | null
  fornecedor_id: number | null
  observacoes: string | null
  status: string | null
  tipo: string | null
  estado: string | null
  custo_reparo: number | null
}

interface Props {
  unidade: Unidade | null
  onClose: () => void
}

const EMPTY: Unidade = {
  produto_id: null, imei: null, imei2: null, numero_serie: null, bateria: null,
  condicao: 'novo', cor: null, armazenamento: null, preco_custo: null, preco_venda: null,
  fornecedor_id: null, observacoes: null, status: 'disponivel', tipo: 'compra',
  estado: 'lacrado', custo_reparo: null,
}

const supabase = createClient()

export default function UnidadeModal({ unidade, onClose }: Props) {
  const router = useRouter()
  const isNew = !unidade?.id
  const [form, setForm] = useState<Unidade>(isNew ? EMPTY : { ...EMPTY, ...unidade })
  const [saving, setSaving] = useState(false)
  const [produtos, setProdutos] = useState<{ id: number; nome: string; marca_nome: string }[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: number; nome_fantasia: string }[]>([])

  useEffect(() => {
    supabase.from('produtos').select('id, nome, marcas_produtos!marca_id(nome)').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setProdutos((data ?? []).map((p: any) => ({
          id: p.id, nome: p.nome, marca_nome: p.marcas_produtos?.nome ?? '',
        })))
      })
    supabase.from('fornecedores').select('id, nome_fantasia').eq('ativo', true).order('nome_fantasia')
      .then(({ data }) => setFornecedores(data ?? []))
  }, [])

  function set(field: keyof Unidade, value: string | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  const margem = form.preco_venda && form.preco_custo
    ? ((form.preco_venda - form.preco_custo) / form.preco_custo * 100).toFixed(1)
    : null

  async function salvar() {
    if (!form.produto_id) { toast.error('Selecione um produto'); return }
    setSaving(true)
    const payload = { ...form, ativo: true }

    if (isNew) {
      const { error } = await supabase.from('inventario_unidades').insert(payload as TablesInsert<'inventario_unidades'>)
      if (error) { toast.error('Erro ao cadastrar: ' + error.message); setSaving(false); return }
      toast.success('Unidade adicionada ao estoque!')
    } else {
      const { error } = await supabase.from('inventario_unidades').update(payload as TablesUpdate<'inventario_unidades'>).eq('id', unidade!.id!)
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
      toast.success('Unidade atualizada!')
    }
    router.refresh()
    onClose()
  }

  async function excluir() {
    if (!confirm('Remover esta unidade do estoque?')) return
    await supabase.from('inventario_unidades').update({ ativo: false }).eq('id', unidade!.id!)
    toast.success('Removido do estoque')
    router.refresh()
    onClose()
  }

  const Input = ({ label, field, placeholder, type = 'text' }: { label: string; field: keyof Unidade; placeholder?: string; type?: string }) => (
    <div>
      <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">{label}</label>
      <input
        type={type}
        value={(form[field] as string) ?? ''}
        onChange={e => set(field, e.target.value || null)}
        placeholder={placeholder}
        className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2] transition-colors"
      />
    </div>
  )

  const Sel = ({ label, field, options }: { label: string; field: keyof Unidade; options: { value: string; label: string }[] }) => (
    <div>
      <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">{label}</label>
      <select
        value={(form[field] as string) ?? ''}
        onChange={e => set(field, e.target.value || null)}
        className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] outline-none focus:border-white/[0.2] transition-colors"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-[600px] max-h-[88vh] bg-[#F0F2F5] border border-[#16212E]/[0.10] rounded-[20px] flex flex-col overflow-hidden shadow-2xl">

        <div className="flex items-center justify-between px-6 py-5 border-b border-[#16212E]/[0.08] shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#16212E]">{isNew ? 'Adicionar Unidade' : 'Editar Unidade'}</h2>
            {!isNew && <p className="text-xs text-[#788698] mt-0.5">ID #{unidade?.id}</p>}
          </div>
          <button onClick={onClose} className="text-[#788698] hover:text-[#9FB0C2] transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); salvar() }} className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            {/* Produto */}
            <div className="col-span-2">
              <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">Produto *</label>
              <select
                value={form.produto_id ?? ''}
                onChange={e => set('produto_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] outline-none focus:border-white/[0.2]"
              >
                <option value="">Selecionar produto...</option>
                {produtos.map(p => (
                  <option key={p.id} value={p.id}>{p.marca_nome} {p.nome}</option>
                ))}
              </select>
            </div>

            <Sel label="Status" field="status" options={[
              { value: 'disponivel', label: 'Disponível' },
              { value: 'reservado', label: 'Reservado' },
              { value: 'vendido', label: 'Vendido' },
              { value: 'assistencia', label: 'Assistência' },
            ]} />
            <Sel label="Tipo" field="tipo" options={[
              { value: 'compra', label: 'Compra' },
              { value: 'seminovo', label: 'Seminovo' },
              { value: 'troca', label: 'Troca' },
              { value: 'consignado', label: 'Consignado' },
            ]} />

            <Input label="IMEI 1" field="imei" placeholder="000000000000000" />
            <Input label="IMEI 2 / Série" field="imei2" placeholder="000000000000000" />
            <Input label="Número de Série" field="numero_serie" placeholder="XXXXX" />
            <Input label="Bateria %" field="bateria" placeholder="95" />
            <Input label="Cor" field="cor" placeholder="Preto, Branco..." />
            <Input label="Armazenamento" field="armazenamento" placeholder="256GB" />

            <Sel label="Condição" field="condicao" options={[
              { value: 'novo', label: 'Novo' },
              { value: 'seminovo', label: 'Seminovo' },
              { value: 'usado', label: 'Usado' },
            ]} />
            <Sel label="Estado Físico" field="estado" options={[
              { value: 'lacrado', label: 'Lacrado' },
              { value: 'excelente', label: 'Excelente' },
              { value: 'otimo', label: 'Ótimo' },
              { value: 'bom', label: 'Bom' },
              { value: 'regular', label: 'Regular' },
            ]} />

            {/* Preços */}
            <div>
              <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">Preço de Custo</label>
              <input
                type="number"
                value={form.preco_custo ?? ''}
                onChange={e => set('preco_custo', e.target.value ? Number(e.target.value) : null)}
                placeholder="0,00"
                className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">
                Preço de Venda
                {margem && <span className="ml-2 text-[#15986A] normal-case font-sans">{margem}% margem</span>}
              </label>
              <input
                type="number"
                value={form.preco_venda ?? ''}
                onChange={e => set('preco_venda', e.target.value ? Number(e.target.value) : null)}
                placeholder="0,00"
                className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2]"
              />
            </div>

            {/* Fornecedor */}
            <div>
              <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">Fornecedor</label>
              <select
                value={form.fornecedor_id ?? ''}
                onChange={e => set('fornecedor_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] outline-none focus:border-white/[0.2]"
              >
                <option value="">Nenhum</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
              </select>
            </div>

            <Input label="Custo de Reparo" field="custo_reparo" type="number" placeholder="0,00" />

            <div className="col-span-2">
              <label className="block text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em] mb-1.5">Observações</label>
              <textarea
                value={form.observacoes ?? ''}
                onChange={e => set('observacoes', e.target.value || null)}
                rows={3}
                placeholder="Defeitos, histórico, detalhes..."
                className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-sm text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2] resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[#16212E]/[0.08] shrink-0">
          {!isNew ? (
            <button type="button" onClick={excluir} className="flex items-center gap-2 text-xs text-[#788698] hover:text-[#F0353D] transition-colors">
              <Trash2 size={14} />
              Remover
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-[9px] text-sm text-[#788698] hover:text-[#56657A] transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
        </form>
      </div>
    </div>
  )
}
