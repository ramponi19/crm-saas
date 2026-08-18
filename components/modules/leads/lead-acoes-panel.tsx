'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { CheckSquare, Square, Plus, CalendarPlus, Loader2, Clock } from 'lucide-react'
import { Input, Button, IconButton, notify } from '@/components/ui'
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
  // Painel de visitas: capacidade, não identidade. Qualquer vertical que agende
  // visita liga `agendaVisitas` e ganha isto sem editar este arquivo.
  const isImob = !!SEGMENTOS[normalizarSegmento(segmento)].capacidades.agendaVisitas

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
    if (error) { notify.bad(error.message); return }
    setTarefas(t => [data as unknown as Tarefa, ...t])
    setNova(''); setPrazo('')
    notify.ok('Tarefa criada')
  }

  async function toggle(t: Tarefa) {
    const nv = !t.concluida
    const { error } = await supabase.from('tarefas').update({ concluida: nv, concluida_em: nv ? new Date().toISOString() : null }).eq('id', t.id)
    if (error) { notify.bad(error.message); return }
    setTarefas(list => list.map(x => x.id === t.id ? { ...x, concluida: nv } : x))
  }

  async function addVisita() {
    if (!visData) { notify.bad('Informe data e hora'); return }
    setVisSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      empresa_id: empresaId, lead_id: leadId, corretor_id: user?.id ?? null,
      data_hora: new Date(visData).toISOString(), status: 'agendada',
      observacoes: visObs || null,
    }
    const { data, error } = await supabase.from('visitas').insert(payload).select('*').single()
    setVisSalvando(false)
    if (error) { notify.bad(error.message); return }
    setVisitas(v => [...v, data as unknown as Visita].sort((a, b) => a.data_hora.localeCompare(b.data_hora)))
    setVisData(''); setVisObs(''); setVisForm(false)
    notify.ok('Visita agendada')
  }

  const agora = Date.now()

  return (
    <div className="border-t border-line-soft pt-[13px]">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Próximas ações</span>

      {/* lista de tarefas */}
      {loading ? (
        <div className="text-[12px] text-ink-3 py-2">Carregando…</div>
      ) : (
        <div className="flex flex-col gap-1 mb-2">
          {tarefas.length === 0 && visitas.length === 0 && (
            <div className="text-[12px] text-ink-3 py-1">Nenhuma ação pendente.</div>
          )}
          {tarefas.map(t => {
            const atrasada = !t.concluida && t.vencimento && new Date(t.vencimento).getTime() < agora
            return (
              <button key={t.id} onClick={() => toggle(t)}
                className="flex items-start gap-2 text-left py-[5px] group">
                {t.concluida
                  ? <CheckSquare size={16} strokeWidth={1.7} className="text-ok shrink-0 mt-[1px]" />
                  : <Square size={16} strokeWidth={1.7} className="text-ink-3 group-hover:text-ok shrink-0 mt-[1px]" />}
                <span className="flex-1 min-w-0">
                  <span className={`text-[12.5px] ${t.concluida ? 'text-ink-3 line-through' : 'text-ink'}`}>{t.titulo}</span>
                  {t.vencimento && (
                    <span className={`block num text-[10.5px] ${atrasada ? 'text-bad font-semibold' : 'text-ink-3'}`}>{fmt(t.vencimento)}</span>
                  )}
                </span>
              </button>
            )
          })}
          {visitas.map(v => (
            <div key={`v${v.id}`} className="flex items-start gap-2 py-[5px]">
              <Clock size={16} strokeWidth={1.7} className="text-accent shrink-0 mt-[1px]" />
              <span className="flex-1 min-w-0">
                <span className="text-[12.5px] text-ink">Visita {v.status !== 'agendada' ? `· ${v.status}` : ''}</span>
                <span className="block num text-[10.5px] text-ink-3">{fmt(v.data_hora)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* nova tarefa */}
      <div className="flex gap-1.5 mb-1.5">
        <Input wrapperClassName="flex-1" value={nova} onChange={e => setNova(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTarefa()}
          placeholder="Nova tarefa de follow-up…" />
        <IconButton aria-label="Adicionar tarefa" variant="primary" onClick={addTarefa} disabled={salvando || !nova.trim()}>
          {salvando ? <Loader2 size={15} strokeWidth={1.7} className="animate-spin" /> : <Plus size={16} strokeWidth={1.7} />}
        </IconButton>
      </div>
      <Input type="datetime-local" value={prazo} onChange={e => setPrazo(e.target.value)}
        className="num text-ink-3" title="Prazo (opcional)" />

      {/* agendar visita (imob) */}
      {isImob && (
        <div className="mt-2">
          {!visForm ? (
            <button onClick={() => setVisForm(true)}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:text-accent/80">
              <CalendarPlus size={15} strokeWidth={1.7} /> Agendar visita
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-card border border-accent/30 bg-accent-soft p-2.5">
              <Input type="datetime-local" className="num" value={visData} onChange={e => setVisData(e.target.value)} />
              <Input value={visObs} onChange={e => setVisObs(e.target.value)} placeholder="Observações (opcional)" />
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setVisForm(false)}>Cancelar</Button>
                <Button size="sm" className="flex-1" onClick={addVisita} loading={visSalvando}>Agendar</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
