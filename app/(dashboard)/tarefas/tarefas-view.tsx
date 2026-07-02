'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, X, Loader2, Check, Trash2, Phone, Mail, MessageCircle, MapPin, CircleDot } from 'lucide-react'
import { toast } from 'sonner'
import type { Tables } from '@/types/database'

type Tarefa = Tables<'tarefas'> & { lead_nome: string | null }
type LeadMin = { id: number; nome: string | null }
type UsuarioMin = { id: string; nome: string }

const TIPOS = [
  { v: 'ligacao', l: 'Ligação', icon: Phone },
  { v: 'whatsapp', l: 'WhatsApp', icon: MessageCircle },
  { v: 'email', l: 'E-mail', icon: Mail },
  { v: 'visita', l: 'Visita', icon: MapPin },
  { v: 'outro', l: 'Outro', icon: CircleDot },
]
const iconTipo = (t: string) => (TIPOS.find(x => x.v === t)?.icon ?? CircleDot)
const fmtData = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem prazo'

export default function TarefasView({ inicial, leads, usuarios, empresaId, meuId, isGestor }: {
  inicial: Tarefa[]; leads: LeadMin[]; usuarios: UsuarioMin[]; empresaId: number; meuId: string; isGestor: boolean
}) {
  const supabase = createClient()
  const [lista, setLista] = useState<Tarefa[]>(inicial)
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const vazio = { titulo: '', tipo: 'ligacao', vencimento: '', lead_id: '', responsavel_id: meuId, descricao: '' }
  const [form, setForm] = useState(vazio)
  const set = (k: keyof typeof vazio, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.titulo.trim()) { toast.error('Informe o título'); return }
    setLoading(true)
    const payload = {
      empresa_id: empresaId, titulo: form.titulo.trim(), tipo: form.tipo,
      vencimento: form.vencimento ? new Date(form.vencimento).toISOString() : null,
      lead_id: form.lead_id ? Number(form.lead_id) : null,
      responsavel_id: form.responsavel_id || meuId,
      descricao: form.descricao || null,
    }
    const { data, error } = await supabase.from('tarefas').insert(payload).select('*, leads(nome)').single()
    setLoading(false)
    if (error) { toast.error(error.message); return }
    const d = data as unknown as (Tables<'tarefas'> & { leads: { nome: string | null } | null })
    const nova: Tarefa = { ...d, lead_nome: d.leads?.nome ?? null }
    setLista(l => [nova, ...l])
    setForm(vazio); setModal(false)
    toast.success('Tarefa criada')
  }

  async function toggle(t: Tarefa) {
    const nova = !t.concluida
    const { error } = await supabase.from('tarefas').update({ concluida: nova, concluida_em: nova ? new Date().toISOString() : null }).eq('id', t.id)
    if (error) { toast.error(error.message); return }
    setLista(l => l.map(x => x.id === t.id ? { ...x, concluida: nova } : x))
  }

  async function excluir(t: Tarefa) {
    if (!confirm('Excluir a tarefa?')) return
    const { error } = await supabase.from('tarefas').delete().eq('id', t.id)
    if (error) { toast.error(error.message); return }
    setLista(l => l.filter(x => x.id !== t.id))
  }

  const agora = Date.now()
  const pend = lista.filter(t => !t.concluida)
  const atrasadas = pend.filter(t => t.vencimento && new Date(t.vencimento).getTime() < agora)
  const proximas = pend.filter(t => !t.vencimento || new Date(t.vencimento).getTime() >= agora)
  const concluidas = lista.filter(t => t.concluida)

  const inp = 'w-full bg-[rgba(22,32,46,.04)] border border-[rgba(22,32,46,.12)] rounded-[10px] px-3 py-2.5 text-[14px] text-[#16212E] outline-none focus:border-[rgba(22,32,46,.35)]'
  const lbl = 'block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5'

  const Linha = (t: Tarefa, atrasada = false) => {
    const Icon = iconTipo(t.tipo)
    return (
      <div key={t.id} className="flex items-center gap-3 py-2.5 px-1 border-b border-[#16212E]/[0.05] last:border-0">
        <button onClick={() => toggle(t)} className={`w-[20px] h-[20px] rounded-[6px] border-2 flex items-center justify-center shrink-0 transition-colors ${t.concluida ? 'bg-[#16A34A] border-[#16A34A]' : 'border-[#16212E]/25 hover:border-[#16A34A]'}`}>
          {t.concluida && <Check size={13} className="text-white" />}
        </button>
        <Icon size={15} className="text-[#9AA7B6] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className={`text-[13.5px] font-medium truncate ${t.concluida ? 'text-[#9AA7B6] line-through' : 'text-[#16212E]'}`}>{t.titulo}</div>
          {t.lead_nome && <div className="text-[11.5px] text-[#788698] truncate">Lead: {t.lead_nome}</div>}
        </div>
        <span className={`text-[11.5px] shrink-0 ${atrasada ? 'text-[#DC2626] font-semibold' : 'text-[#788698]'}`}>{fmtData(t.vencimento)}</span>
        <button onClick={() => excluir(t)} className="p-1.5 rounded text-[#B0BCC9] hover:text-[#DC2626] shrink-0" aria-label="Excluir"><Trash2 size={14} /></button>
      </div>
    )
  }

  const Bloco = ({ titulo, itens, cor, atrasada }: { titulo: string; itens: Tarefa[]; cor: string; atrasada?: boolean }) =>
    itens.length === 0 ? null : (
      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-4 mb-4">
        <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full" style={{ background: cor }} /><h3 className="text-[13px] font-bold text-[#16212E]">{titulo} <span className="text-[#9AA7B6] font-normal">({itens.length})</span></h3></div>
        {itens.map(t => Linha(t, atrasada))}
      </div>
    )

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Tarefas" />
      <div className="p-6 max-w-[820px]">
        <div className="flex justify-end mb-4">
          <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] hover:bg-[#22303f]">
            <Plus size={17} /> Nova tarefa
          </button>
        </div>

        {pend.length === 0 && concluidas.length === 0 && (
          <div className="text-center py-16 text-[#788698] text-[14px]">Nenhuma tarefa. Crie a primeira! 🎯</div>
        )}
        <Bloco titulo="Atrasadas" itens={atrasadas} cor="#DC2626" atrasada />
        <Bloco titulo="A fazer" itens={proximas} cor="#C9A24B" />
        <Bloco titulo="Concluídas" itens={concluidas.slice(0, 20)} cor="#16A34A" />
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModal(false)}>
          <div className="bg-white rounded-[18px] w-full max-w-[460px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[17px] text-[#16212E]">Nova tarefa</h3>
              <button onClick={() => setModal(false)} className="text-[#9AA7B6] hover:text-[#16212E]"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className={lbl}>TÍTULO *</label><input value={form.titulo} onChange={e => set('titulo', e.target.value)} className={inp} placeholder="Ex: Ligar para o cliente" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>TIPO</label>
                  <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inp}>{TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
                <div><label className={lbl}>VENCIMENTO</label><input type="datetime-local" value={form.vencimento} onChange={e => set('vencimento', e.target.value)} className={inp} /></div>
              </div>
              <div><label className={lbl}>LEAD (opcional)</label>
                <select value={form.lead_id} onChange={e => set('lead_id', e.target.value)} className={inp}>
                  <option value="">— nenhum —</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.nome || `Lead #${l.id}`}</option>)}
                </select></div>
              {isGestor && (
                <div><label className={lbl}>RESPONSÁVEL</label>
                  <select value={form.responsavel_id} onChange={e => set('responsavel_id', e.target.value)} className={inp}>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select></div>
              )}
              <div><label className={lbl}>DESCRIÇÃO</label><textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} className={inp} /></div>
            </div>
            <div className="flex gap-2.5 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-[#788698] border border-[#16212E]/[0.1]">Cancelar</button>
              <button onClick={salvar} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] disabled:opacity-60">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando…</> : 'Criar tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
