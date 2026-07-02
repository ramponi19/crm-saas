'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckSquare, Square, Plus, CalendarPlus, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { Tables } from '@/types/database'

type Tarefa = Tables<'tarefas'>
type Visita = Tables<'visitas'>

const fmt = (s: string | null) => s
  ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : null

/**
 * Painel de "Próximas ações" dentro do lead: tarefas de follow-up (todos os
 * segmentos) e, para imobiliária, agendamento rápido de visita. Auto-contido —
 * busca e grava direto no Supabase com o usuário logado como responsável.
 */
export function LeadAcoesPanel({ leadId, empresaId, segmento }: {
  leadId: number; empresaId: number; segmento?: string | null
}) {
  const supabase = createClient()
  const isImob = segmento === 'imobiliaria'

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [loading, setLoading] = useState(true)

  const [nova, setNova] = useState('')
  const [prazo, setPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [visForm, setVisForm] = useState(false)
  const [visData, setVisData] = useState('')
  const [visObs, setVisObs] = useState('')
  const [visSalvando, setVisSalvando] = useState(false)

  useEffect(() => {
    let cancel = false
    async function load() {
      const [t, v] = await Promise.all([
        supabase.from('tarefas').select('*').eq('lead_id', leadId).order('concluida').order('vencimento', { nullsFirst: false }),
        isImob
          ? supabase.from('visitas').select('*').eq('lead_id', leadId).order('data_hora', { ascending: true })
          : Promise.resolve({ data: [] }),
      ])
      if (cancel) return
      setTarefas((t.data as unknown as Tarefa[]) ?? [])
      setVisitas((v.data as unknown as Visita[]) ?? [])
      setLoading(false)
    }
    load()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  async function addTarefa() {
    if (!nova.trim()) return
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      empresa_id: empresaId, lead_id: leadId, titulo: nova.trim(), tipo: 'outro',
      vencimento: prazo ? new Date(prazo).toISOString() : null,
      responsavel_id: user?.id ?? null,
    }
    const { data, error } = await supabase.from('tarefas').insert(payload).select('*').single()
    setSalvando(false)
    if (error) { toast.error(error.message); return }
    setTarefas(t => [data as unknown as Tarefa, ...t])
    setNova(''); setPrazo('')
    toast.success('Tarefa criada')
  }

  async function toggle(t: Tarefa) {
    const nv = !t.concluida
    const { error } = await supabase.from('tarefas').update({ concluida: nv, concluida_em: nv ? new Date().toISOString() : null }).eq('id', t.id)
    if (error) { toast.error(error.message); return }
    setTarefas(list => list.map(x => x.id === t.id ? { ...x, concluida: nv } : x))
  }

  async function addVisita() {
    if (!visData) { toast.error('Informe data e hora'); return }
    setVisSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      empresa_id: empresaId, lead_id: leadId, corretor_id: user?.id ?? null,
      data_hora: new Date(visData).toISOString(), status: 'agendada',
      observacoes: visObs || null,
    }
    const { data, error } = await supabase.from('visitas').insert(payload).select('*').single()
    setVisSalvando(false)
    if (error) { toast.error(error.message); return }
    setVisitas(v => [...v, data as unknown as Visita].sort((a, b) => a.data_hora.localeCompare(b.data_hora)))
    setVisData(''); setVisObs(''); setVisForm(false)
    toast.success('Visita agendada')
  }

  const agora = Date.now()
  const labelCls = 'font-mono text-[10px] tracking-[0.12em] text-[#6B7C92] uppercase mb-[6px] block'
  const inputCls = 'w-full bg-white/[0.04] border border-[#16212E]/[0.10] rounded-[9px] px-[11px] py-[8px] text-[13px] text-[#1F2A39] outline-none focus:border-[rgba(201,162,75,0.6)] transition-colors box-border'

  return (
    <div className="border-t border-[#16212E]/[0.08] pt-[13px]">
      <label className={labelCls}>Próximas ações</label>

      {/* lista de tarefas */}
      {loading ? (
        <div className="text-[12px] text-[#788698] py-2">Carregando…</div>
      ) : (
        <div className="flex flex-col gap-1 mb-2">
          {tarefas.length === 0 && visitas.length === 0 && (
            <div className="text-[12px] text-[#9AA7B6] py-1">Nenhuma ação pendente.</div>
          )}
          {tarefas.map(t => {
            const atrasada = !t.concluida && t.vencimento && new Date(t.vencimento).getTime() < agora
            return (
              <button key={t.id} onClick={() => toggle(t)}
                className="flex items-start gap-2 text-left py-[5px] group">
                {t.concluida
                  ? <CheckSquare size={16} className="text-[#16A34A] shrink-0 mt-[1px]" />
                  : <Square size={16} className="text-[#9AA7B6] group-hover:text-[#16A34A] shrink-0 mt-[1px]" />}
                <span className="flex-1 min-w-0">
                  <span className={`text-[12.5px] ${t.concluida ? 'text-[#9AA7B6] line-through' : 'text-[#1F2A39]'}`}>{t.titulo}</span>
                  {t.vencimento && (
                    <span className={`block text-[10.5px] ${atrasada ? 'text-[#DC2626] font-semibold' : 'text-[#788698]'}`}>{fmt(t.vencimento)}</span>
                  )}
                </span>
              </button>
            )
          })}
          {visitas.map(v => (
            <div key={`v${v.id}`} className="flex items-start gap-2 py-[5px]">
              <Clock size={16} className="text-[#8A6D2B] shrink-0 mt-[1px]" />
              <span className="flex-1 min-w-0">
                <span className="text-[12.5px] text-[#1F2A39]">Visita {v.status !== 'agendada' ? `· ${v.status}` : ''}</span>
                <span className="block text-[10.5px] text-[#788698]">{fmt(v.data_hora)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* nova tarefa */}
      <div className="flex gap-1.5 mb-1.5">
        <input value={nova} onChange={e => setNova(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTarefa()}
          placeholder="Nova tarefa de follow-up…" className={inputCls} />
        <button onClick={addTarefa} disabled={salvando || !nova.trim()}
          className="w-[38px] shrink-0 rounded-[9px] bg-[#16212E] text-white flex items-center justify-center disabled:opacity-40">
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>
      <input type="datetime-local" value={prazo} onChange={e => setPrazo(e.target.value)}
        className={`${inputCls} text-[#788698]`} title="Prazo (opcional)" />

      {/* agendar visita (imob) */}
      {isImob && (
        <div className="mt-2">
          {!visForm ? (
            <button onClick={() => setVisForm(true)}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-[#8A6D2B] hover:text-[#6b5420]">
              <CalendarPlus size={15} /> Agendar visita
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#C9A24B]/40 bg-[#C9A24B]/[0.06] p-2.5">
              <input type="datetime-local" value={visData} onChange={e => setVisData(e.target.value)} className={inputCls} />
              <input value={visObs} onChange={e => setVisObs(e.target.value)} placeholder="Observações (opcional)" className={inputCls} />
              <div className="flex gap-1.5">
                <button onClick={() => setVisForm(false)} className="flex-1 py-[7px] rounded-[9px] text-[12px] font-semibold text-[#788698] border border-[#16212E]/10">Cancelar</button>
                <button onClick={addVisita} disabled={visSalvando}
                  className="flex-1 py-[7px] rounded-[9px] text-[12px] font-semibold text-white bg-[#16212E] disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {visSalvando ? <Loader2 size={14} className="animate-spin" /> : 'Agendar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
