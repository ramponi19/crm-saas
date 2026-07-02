'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, X, Loader2, Clock, MapPin, Phone, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import type { Tables } from '@/types/database'

type Visita = Tables<'visitas'> & { lead_nome: string | null; lead_tel: string | null; imovel_nome: string | null; imovel_bairro: string | null }
type Opt = { id: number; nome: string | null }
type UsuarioMin = { id: string; nome: string }

const STATUS = [
  { v: 'agendada', l: 'Agendada', c: '#7FB0E8' },
  { v: 'realizada', l: 'Realizada', c: '#16A34A' },
  { v: 'cancelada', l: 'Cancelada', c: '#DC2626' },
  { v: 'no_show', l: 'Não compareceu', c: '#D97706' },
]
const stInfo = (s: string) => STATUS.find(x => x.v === s) ?? STATUS[0]
const diaLabel = (iso: string) => {
  const d = new Date(iso); const hoje = new Date()
  const key = (x: Date) => x.toISOString().slice(0, 10)
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  if (key(d) === key(hoje)) return 'Hoje'
  if (key(d) === key(amanha)) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function AgendaView({ inicial, leads, imoveis, usuarios, empresaId, meuId, isGestor }: {
  inicial: Visita[]; leads: Opt[]; imoveis: Opt[]; usuarios: UsuarioMin[]; empresaId: number; meuId: string; isGestor: boolean
}) {
  const supabase = createClient()
  const [lista, setLista] = useState<Visita[]>(inicial)
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const vazio = { lead_id: '', imovel_id: '', corretor_id: meuId, data_hora: '', observacoes: '' }
  const [form, setForm] = useState(vazio)
  const set = (k: keyof typeof vazio, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.data_hora) { toast.error('Informe data e hora'); return }
    setLoading(true)
    const payload = {
      empresa_id: empresaId,
      lead_id: form.lead_id ? Number(form.lead_id) : null,
      imovel_id: form.imovel_id ? Number(form.imovel_id) : null,
      corretor_id: form.corretor_id || meuId,
      data_hora: new Date(form.data_hora).toISOString(),
      status: 'agendada',
      observacoes: form.observacoes || null,
    }
    const { data, error } = await supabase.from('visitas').insert(payload).select('*, leads(nome, telefone), imoveis(titulo, codigo, bairro)').single()
    setLoading(false)
    if (error) { toast.error(error.message); return }
    const d = data as unknown as { leads?: { nome: string | null; telefone: string | null }; imoveis?: { titulo: string | null; codigo: string | null; bairro: string | null } } & Tables<'visitas'>
    const nova: Visita = { ...d, lead_nome: d.leads?.nome ?? null, lead_tel: d.leads?.telefone ?? null, imovel_nome: d.imoveis ? (d.imoveis.titulo || d.imoveis.codigo) : null, imovel_bairro: d.imoveis?.bairro ?? null }
    setLista(l => [...l, nova].sort((a, b) => a.data_hora.localeCompare(b.data_hora)))
    setForm(vazio); setModal(false)
    toast.success('Visita agendada')
  }

  async function mudarStatus(v: Visita, status: string) {
    const { error } = await supabase.from('visitas').update({ status }).eq('id', v.id)
    if (error) { toast.error(error.message); return }
    setLista(l => l.map(x => x.id === v.id ? { ...x, status } : x))
  }

  // agrupa por dia
  const grupos: { label: string; itens: Visita[] }[] = []
  for (const v of lista) {
    const lbl = diaLabel(v.data_hora)
    const g = grupos.find(x => x.label === lbl)
    if (g) g.itens.push(v); else grupos.push({ label: lbl, itens: [v] })
  }

  const inp = 'w-full bg-[rgba(22,32,46,.04)] border border-[rgba(22,32,46,.12)] rounded-[10px] px-3 py-2.5 text-[14px] text-[#16212E] outline-none focus:border-[rgba(22,32,46,.35)]'
  const lbl = 'block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5'

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Agenda" />
      <div className="p-6 max-w-[820px]">
        <div className="flex justify-end mb-4">
          <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] hover:bg-[#22303f]">
            <Plus size={17} /> Agendar visita
          </button>
        </div>

        {lista.length === 0 ? (
          <div className="text-center py-16 text-[#788698]"><CalendarDays size={34} className="mx-auto mb-3 opacity-40" /><p className="text-[14px]">Nenhuma visita agendada.</p></div>
        ) : grupos.map(g => (
          <div key={g.label} className="mb-5">
            <div className="text-[12px] font-bold text-[#8A6D2B] uppercase tracking-wide mb-2 capitalize">{g.label}</div>
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] divide-y divide-[#16212E]/[0.05]">
              {g.itens.map(v => {
                const st = stInfo(v.status)
                return (
                  <div key={v.id} className="flex items-center gap-3 p-4">
                    <div className="text-center shrink-0 w-[52px]">
                      <div className="text-[16px] font-extrabold text-[#16212E] leading-none flex items-center justify-center gap-1"><Clock size={13} className="text-[#9AA7B6]" />{hora(v.data_hora)}</div>
                    </div>
                    <div className="flex-1 min-w-0 border-l border-[#16212E]/[0.08] pl-3">
                      <div className="text-[14px] font-semibold text-[#16212E] truncate">{v.lead_nome || 'Visita'}</div>
                      <div className="flex items-center gap-3 text-[12px] text-[#788698] mt-0.5">
                        {v.imovel_nome && <span className="inline-flex items-center gap-1 truncate"><MapPin size={12} />{v.imovel_nome}{v.imovel_bairro ? ` · ${v.imovel_bairro}` : ''}</span>}
                        {v.lead_tel && <span className="inline-flex items-center gap-1"><Phone size={12} />{v.lead_tel}</span>}
                      </div>
                    </div>
                    <select value={v.status} onChange={e => mudarStatus(v, e.target.value)}
                      className="text-[11.5px] font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer shrink-0 outline-none"
                      style={{ background: `${st.c}18`, color: st.c }}>
                      {STATUS.map(s => <option key={s.v} value={s.v} style={{ background: '#fff', color: '#16212E' }}>{s.l}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModal(false)}>
          <div className="bg-white rounded-[18px] w-full max-w-[460px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[17px] text-[#16212E]">Agendar visita</h3>
              <button onClick={() => setModal(false)} className="text-[#9AA7B6] hover:text-[#16212E]"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className={lbl}>DATA E HORA *</label><input type="datetime-local" value={form.data_hora} onChange={e => set('data_hora', e.target.value)} className={inp} /></div>
              <div><label className={lbl}>LEAD / CLIENTE</label>
                <select value={form.lead_id} onChange={e => set('lead_id', e.target.value)} className={inp}>
                  <option value="">— selecionar —</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.nome || `Lead #${l.id}`}</option>)}
                </select></div>
              <div><label className={lbl}>IMÓVEL</label>
                <select value={form.imovel_id} onChange={e => set('imovel_id', e.target.value)} className={inp}>
                  <option value="">— selecionar —</option>
                  {imoveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select></div>
              {isGestor && (
                <div><label className={lbl}>CORRETOR</label>
                  <select value={form.corretor_id} onChange={e => set('corretor_id', e.target.value)} className={inp}>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select></div>
              )}
              <div><label className={lbl}>OBSERVAÇÕES</label><textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} className={inp} /></div>
            </div>
            <div className="flex gap-2.5 mt-6">
              <button onClick={() => setModal(false)} className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-[#788698] border border-[#16212E]/[0.1]">Cancelar</button>
              <button onClick={salvar} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] disabled:opacity-60">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando…</> : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
