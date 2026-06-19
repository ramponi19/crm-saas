'use client'

import { useState } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Ordem {
  id?: number
  protocolo: string | null
  tipo: string | null
  cliente_id: number | null
  produto_id: number | null
  responsavel_tecnico_id: string | null
  imei_serial: string | null
  defeito_relatado: string | null
  estado_entrada: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  dentro_garantia: boolean | null
  status: string | null
  observacoes: string | null
}

interface Props {
  ordem: Ordem | null
  clientes: { id: number; nome: string; telefone: string | null }[]
  produtos: { id: number; nome: string }[]
  tecnicos: { id: string; nome: string }[]
  onClose: () => void
}

const EMPTY: Ordem = {
  protocolo: null, tipo: 'reparo', cliente_id: null, produto_id: null,
  responsavel_tecnico_id: null, imei_serial: null, defeito_relatado: null,
  estado_entrada: null, parecer_tecnico: null, orcamento_valor: null,
  celular_reserva_fornecido: false, modelo_reserva: null, dentro_garantia: false,
  status: 'aguardando', observacoes: null,
}

export default function OSModal({ ordem, clientes, produtos, tecnicos, onClose }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const isNew = !ordem?.id
  const [form, setForm] = useState<Ordem>(isNew ? EMPTY : { ...EMPTY, ...ordem })
  const [saving, setSaving] = useState(false)

  function set(field: keyof Ordem, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function gerarProtocolo() {
    const ts = Date.now().toString(36).toUpperCase()
    set('protocolo', `OS-${ts}`)
  }

  async function salvar() {
    if (!form.cliente_id) { toast.error('Selecione um cliente'); return }
    setSaving(true)
    const payload = {
      ...form,
      data_entrada: isNew ? new Date().toISOString() : undefined,
    }
    if (isNew) delete payload.id

    if (isNew) {
      if (!form.protocolo) payload.protocolo = `OS-${Date.now().toString(36).toUpperCase()}`
      const { error } = await supabase.from('garantias_assistencias').insert(payload)
      if (error) { toast.error('Erro: ' + error.message); setSaving(false); return }
      toast.success('OS criada!')
    } else {
      const { error } = await supabase.from('garantias_assistencias').update(payload).eq('id', ordem!.id!)
      if (error) { toast.error('Erro: ' + error.message); setSaving(false); return }
      toast.success('OS atualizada!')
    }
    router.refresh()
    onClose()
  }

  const Input = ({ label, field, placeholder, type = 'text' }: { label: string; field: keyof Ordem; placeholder?: string; type?: string }) => (
    <div>
      <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">{label}</label>
      <input
        type={type}
        value={(form[field] as string) ?? ''}
        onChange={e => set(field, e.target.value || null)}
        placeholder={placeholder}
        className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2]"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[640px] max-h-[90vh] bg-[#0D1824] border border-white/[0.08] rounded-[20px] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#F4F6F9]">
              {isNew ? 'Nova OS' : `OS #${form.protocolo ?? ordem?.id}`}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#5C6E84] hover:text-[#9FB0C2]"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            {/* Protocolo */}
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Protocolo</label>
              <div className="flex gap-2">
                <input
                  value={form.protocolo ?? ''}
                  onChange={e => set('protocolo', e.target.value || null)}
                  className="flex-1 bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/[0.2]"
                />
                <button
                  onClick={gerarProtocolo}
                  className="px-3 py-2.5 rounded-[9px] bg-white/[0.05] text-xs text-[#8A9BB0] hover:text-[#D4DEEA] whitespace-nowrap"
                >
                  Gerar
                </button>
              </div>
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Tipo</label>
              <select
                value={form.tipo ?? 'reparo'}
                onChange={e => set('tipo', e.target.value)}
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
              >
                {['reparo', 'troca_tela', 'troca_bateria', 'desbloqueio', 'limpeza', 'diagnostico', 'outro'].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            {/* Cliente */}
            <div className="col-span-2">
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Cliente *</label>
              <select
                value={form.cliente_id ?? ''}
                onChange={e => set('cliente_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
              >
                <option value="">Selecionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}{c.telefone ? ` — ${c.telefone}` : ''}</option>)}
              </select>
            </div>

            {/* Produto */}
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Produto</label>
              <select
                value={form.produto_id ?? ''}
                onChange={e => set('produto_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
              >
                <option value="">Selecionar...</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <Input label="IMEI / Série" field="imei_serial" placeholder="IMEI ou número de série" />

            {/* Técnico */}
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Técnico Responsável</label>
              <select
                value={form.responsavel_tecnico_id ?? ''}
                onChange={e => set('responsavel_tecnico_id', e.target.value || null)}
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
              >
                <option value="">Não atribuído</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Status</label>
              <select
                value={form.status ?? 'aguardando'}
                onChange={e => set('status', e.target.value)}
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
              >
                {[
                  { value: 'aguardando', label: 'Aguardando' },
                  { value: 'em_reparo', label: 'Em Reparo' },
                  { value: 'aguard_peca', label: 'Aguardando Peça' },
                  { value: 'pronto', label: 'Pronto' },
                  { value: 'entregue', label: 'Entregue' },
                  { value: 'cancelado', label: 'Cancelado' },
                ].map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Orçamento */}
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Orçamento R$</label>
              <input
                type="number"
                value={form.orcamento_valor ?? ''}
                onChange={e => set('orcamento_valor', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
              />
            </div>

            {/* Checkboxes */}
            <div className="col-span-2 flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.dentro_garantia ?? false}
                  onChange={e => set('dentro_garantia', e.target.checked)}
                  className="w-4 h-4 rounded accent-[#D7282F]"
                />
                <span className="text-sm text-[#8A9BB0]">Dentro da Garantia</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.celular_reserva_fornecido ?? false}
                  onChange={e => set('celular_reserva_fornecido', e.target.checked)}
                  className="w-4 h-4 rounded accent-[#D7282F]"
                />
                <span className="text-sm text-[#8A9BB0]">Celular Reserva Fornecido</span>
              </label>
            </div>

            {form.celular_reserva_fornecido && (
              <div className="col-span-2">
                <Input label="Modelo do Reserva" field="modelo_reserva" placeholder="Ex: iPhone 11 — IMEI 123..." />
              </div>
            )}

            {/* Defeito */}
            <div className="col-span-2">
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Defeito Relatado</label>
              <textarea
                value={form.defeito_relatado ?? ''}
                onChange={e => set('defeito_relatado', e.target.value || null)}
                rows={2}
                placeholder="Descreva o problema relatado pelo cliente..."
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none resize-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Estado de Entrada</label>
              <textarea
                value={form.estado_entrada ?? ''}
                onChange={e => set('estado_entrada', e.target.value || null)}
                rows={2}
                placeholder="Descreva o estado físico do aparelho na entrada..."
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none resize-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Parecer Técnico</label>
              <textarea
                value={form.parecer_tecnico ?? ''}
                onChange={e => set('parecer_tecnico', e.target.value || null)}
                rows={2}
                placeholder="Diagnóstico e solução aplicada..."
                className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] shrink-0">
          <div />
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
              {saving ? 'Salvando...' : 'Salvar OS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
