'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Video, Phone, Users, ListTodo, Check } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

export interface Evento {
  id: number; titulo: string; tipo: string; vencimento: string | null; concluida: boolean; lead_nome: string | null
}
const TIPOS: Record<string, { label: string; icon: typeof Phone }> = {
  ligacao: { label: 'Ligação', icon: Phone }, reuniao: { label: 'Reunião', icon: Video },
  followup: { label: 'Follow-up', icon: Users }, tarefa: { label: 'Tarefa', icon: ListTodo },
}
type Vista = 'dia' | 'semana' | 'mes' | 'agenda'

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']
const HORAS = Array.from({ length: 15 }, (_, i) => i + 7) // 07:00–21:00
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const mesmoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
function inicioSemana(d: Date) { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0, 0, 0, 0); return x }
function addDias(d: Date, n: number) { const x = new Date(d); x.setDate(d.getDate() + n); return x }

export function Calendario({ iniciais }: { iniciais: Evento[] }) {
  const [eventos, setEventos] = useState<Evento[]>(iniciais)
  const [vista, setVista] = useState<Vista>('semana')
  const [ref, setRef] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const vazio = { titulo: '', tipo: 'reuniao', vencimento: '', descricao: '' }
  const [form, setForm] = useState(vazio)

  const comData = useMemo(() => eventos.filter((e) => e.vencimento), [eventos])

  function eventosDoDia(d: Date) {
    return comData.filter((e) => mesmoDia(new Date(e.vencimento as string), d)).sort((a, b) => (a.vencimento as string).localeCompare(b.vencimento as string))
  }

  function navegar(dir: number) {
    if (vista === 'mes') { const x = new Date(ref); x.setMonth(ref.getMonth() + dir); setRef(x) }
    else if (vista === 'semana') setRef(addDias(ref, dir * 7))
    else setRef(addDias(ref, dir))
  }

  async function toggle(e: Evento) {
    const novo = !e.concluida
    setEventos((l) => l.map((x) => x.id === e.id ? { ...x, concluida: novo } : x))
    await fetch(`/api/tracker/compromissos/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concluida: novo }) }).catch(() => {})
  }

  async function salvar() {
    if (!form.titulo.trim()) return
    setSalvando(true)
    try {
      const r = await fetch('/api/tracker/compromissos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (r.ok) {
        setEventos((l) => [...l, { id: d.id, titulo: form.titulo, tipo: form.tipo, vencimento: form.vencimento ? new Date(form.vencimento).toISOString() : null, concluida: false, lead_nome: null }])
        setForm(vazio); setModal(false)
      }
    } finally { setSalvando(false) }
  }

  const semana = Array.from({ length: 7 }, (_, i) => addDias(inicioSemana(ref), i))
  const hoje = new Date()

  const rangeLabel = vista === 'mes'
    ? ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : vista === 'semana'
      ? `${semana[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${semana[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
      : ref.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <div className="flex h-full min-h-0">
      {/* Painel lateral */}
      <aside className="hidden w-[264px] shrink-0 flex-col gap-3 overflow-y-auto border-r p-4 md:flex" style={{ borderColor: C.line, background: C.card }}>
        <button onClick={() => setModal(true)} className="flex items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold text-white" style={{ background: C.teal }}><Plus size={16} strokeWidth={2} /> Criar reunião</button>
        <div className="rounded-[12px] border p-3" style={{ borderColor: '#cfe8df', background: '#f6faf8' }}>
          <p className="text-[12px]" style={{ color: C.ink2 }}>Conecte o Google para sincronizar reuniões, gerar Meet e mostrar à equipe se você está livre ou ocupado.</p>
          <a href="/tracker/configuracoes" className="mt-2 inline-block rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-white" style={{ background: C.tealDark }}>Conectar Google Calendar</a>
        </div>
        <MiniCal ref_={ref} onPick={(d) => { setRef(d); setVista('dia') }} hoje={hoje} />
        <div className="rounded-[12px] border p-3" style={{ borderColor: C.line }}>
          <div className="mb-1.5 text-[12px] font-semibold" style={{ color: C.ink }}>Agenda de {ref.toLocaleDateString('pt-BR')}</div>
          {eventosDoDia(ref).length === 0 ? <div className="text-[12px]" style={{ color: C.ink3 }}>Nenhum compromisso neste dia.</div> : (
            <div className="space-y-1.5">{eventosDoDia(ref).map((e) => <div key={e.id} className="flex items-center gap-2 text-[12px]"><span className="font-semibold" style={{ color: C.tealDark }}>{hhmm(e.vencimento as string)}</span><span className="truncate" style={{ color: C.ink2 }}>{e.titulo}</span></div>)}</div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-7" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}><Plus size={16} strokeWidth={2} /> Criar</button>
          <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setRef(d) }} className="rounded-[9px] border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: C.line, color: C.ink2 }}>Hoje</button>
          <div className="flex items-center">
            <button onClick={() => navegar(-1)} className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ color: C.ink2 }}><ChevronLeft size={18} /></button>
            <button onClick={() => navegar(1)} className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ color: C.ink2 }}><ChevronRight size={18} /></button>
          </div>
          <span className="text-[15px] font-semibold capitalize" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{rangeLabel}</span>
        </div>
        <div className="flex gap-0.5 rounded-[10px] border p-0.5" style={{ borderColor: C.line }}>
          {(['dia', 'semana', 'mes', 'agenda'] as Vista[]).map((v) => (
            <button key={v} onClick={() => setVista(v)} className="rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors" style={vista === v ? { background: C.teal, color: '#fff' } : { color: C.ink2 }}>{v === 'mes' ? 'Mês' : v}</button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {vista === 'agenda' ? <Agenda eventos={comData} onToggle={toggle} /> : vista === 'mes' ? (
          <Mes ref_={ref} eventosDoDia={eventosDoDia} hoje={hoje} onDia={(d) => { setRef(d); setVista('dia') }} />
        ) : (
          <Grade dias={vista === 'dia' ? [ref] : semana} eventosDoDia={eventosDoDia} hoje={hoje} onToggle={toggle} />
        )}
      </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) setModal(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-[440px] rounded-[16px] border p-5" style={{ background: C.card, borderColor: C.line }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Novo compromisso</h2>
              <button onClick={() => setModal(false)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.ink3 }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Título</span><input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="tk-cal" placeholder="Reunião com cliente" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Tipo</span>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="tk-cal">{Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}</select>
                </label>
                <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Data e hora</span><input type="datetime-local" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className="tk-cal" /></label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(false)} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ color: C.ink2 }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.titulo.trim()} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.tk-cal{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13.5px;color:${C.ink};background:#fff;outline:none}.tk-cal:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}

function MiniCal({ ref_, onPick, hoje }: { ref_: Date; onPick: (d: Date) => void; hoje: Date }) {
  const [mes, setMes] = useState(() => new Date(ref_.getFullYear(), ref_.getMonth(), 1))
  const inicio = addDias(mes, -mes.getDay())
  const celulas = Array.from({ length: 42 }, (_, i) => addDias(inicio, i))
  return (
    <div className="rounded-[12px] border p-3" style={{ borderColor: C.line }}>
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="grid h-6 w-6 place-items-center rounded" style={{ color: C.ink3 }}><ChevronLeft size={15} /></button>
        <span className="text-[12.5px] font-semibold capitalize" style={{ color: C.ink }}>{mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="grid h-6 w-6 place-items-center rounded" style={{ color: C.ink3 }}><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS.map((d) => <div key={d} className="text-[9.5px] font-semibold" style={{ color: C.ink3 }}>{d[0]}</div>)}
        {celulas.map((d) => {
          const fora = d.getMonth() !== mes.getMonth()
          const ehHoje = mesmoDia(d, hoje)
          return <button key={d.toISOString()} onClick={() => onPick(d)} className="grid h-7 place-items-center rounded-full text-[11.5px]" style={ehHoje ? { background: C.teal, color: '#fff', fontWeight: 700 } : { color: fora ? '#c7d0d6' : C.ink2 }}>{d.getDate()}</button>
        })}
      </div>
    </div>
  )
}

function Grade({ dias, eventosDoDia, hoje, onToggle }: { dias: Date[]; eventosDoDia: (d: Date) => Evento[]; hoje: Date; onToggle: (e: Evento) => void }) {
  return (
    <div className="min-w-[640px]">
      <div className="sticky top-0 z-10 grid border-b bg-white" style={{ gridTemplateColumns: `56px repeat(${dias.length}, 1fr)`, borderColor: C.line }}>
        <div />
        {dias.map((d) => (
          <div key={d.toISOString()} className="border-l py-2 text-center" style={{ borderColor: C.line }}>
            <div className="text-[10.5px] font-semibold" style={{ color: C.ink3 }}>{DIAS[d.getDay()]}</div>
            <div className="mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-[14px] font-semibold" style={mesmoDia(d, hoje) ? { background: C.teal, color: '#fff' } : { color: C.ink }}>{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dias.length}, 1fr)` }}>
        <div>
          {HORAS.map((h) => <div key={h} className="h-14 pr-2 text-right text-[10.5px]" style={{ color: C.ink3 }}>{String(h).padStart(2, '0')}:00</div>)}
        </div>
        {dias.map((d) => (
          <div key={d.toISOString()} className="relative border-l" style={{ borderColor: C.line }}>
            {HORAS.map((h) => <div key={h} className="h-14 border-b" style={{ borderColor: C.line }} />)}
            {eventosDoDia(d).map((e) => {
              const dt = new Date(e.vencimento as string)
              const top = ((dt.getHours() - 7) * 60 + dt.getMinutes()) / 60 * 56
              if (top < 0) return null
              const t = TIPOS[e.tipo] ?? TIPOS.tarefa
              return (
                <button key={e.id} onClick={() => onToggle(e)} className="absolute left-1 right-1 overflow-hidden rounded-[7px] px-2 py-1 text-left" style={{ top, minHeight: 26, background: e.concluida ? '#e7efec' : 'rgba(0,168,132,0.12)', borderLeft: `3px solid ${C.teal}` }}>
                  <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: C.tealDark, textDecoration: e.concluida ? 'line-through' : 'none' }}><t.icon size={11} /> {hhmm(e.vencimento as string)}</div>
                  <div className="truncate text-[11.5px]" style={{ color: C.ink }}>{e.titulo}</div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function Mes({ ref_, eventosDoDia, hoje, onDia }: { ref_: Date; eventosDoDia: (d: Date) => Evento[]; hoje: Date; onDia: (d: Date) => void }) {
  const primeiro = new Date(ref_.getFullYear(), ref_.getMonth(), 1)
  const inicio = addDias(primeiro, -primeiro.getDay())
  const celulas = Array.from({ length: 42 }, (_, i) => addDias(inicio, i))
  return (
    <div className="p-3 sm:p-5">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[12px] border" style={{ borderColor: C.line, background: C.line }}>
        {DIAS.map((d) => <div key={d} className="bg-white py-2 text-center text-[10.5px] font-semibold" style={{ color: C.ink3 }}>{d}</div>)}
        {celulas.map((d) => {
          const ev = eventosDoDia(d)
          const foraMes = d.getMonth() !== ref_.getMonth()
          return (
            <button key={d.toISOString()} onClick={() => onDia(d)} className="min-h-[92px] bg-white p-1.5 text-left align-top" style={{ opacity: foraMes ? 0.45 : 1 }}>
              <div className="mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-[12.5px] font-semibold" style={mesmoDia(d, hoje) ? { background: C.teal, color: '#fff' } : { color: C.ink }}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {ev.slice(0, 3).map((e) => <div key={e.id} className="truncate rounded-[5px] px-1 py-0.5 text-[10.5px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.tealDark }}>{hhmm(e.vencimento as string)} {e.titulo}</div>)}
                {ev.length > 3 && <div className="text-[10px]" style={{ color: C.ink3 }}>+{ev.length - 3}</div>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Agenda({ eventos, onToggle }: { eventos: Evento[]; onToggle: (e: Evento) => void }) {
  const ord = [...eventos].sort((a, b) => (a.vencimento as string).localeCompare(b.vencimento as string))
  const grupos: { label: string; itens: Evento[] }[] = []
  for (const e of ord) {
    const lbl = new Date(e.vencimento as string).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    const g = grupos.find((x) => x.label === lbl); if (g) g.itens.push(e); else grupos.push({ label: lbl, itens: [e] })
  }
  if (ord.length === 0) return <div className="grid min-h-[200px] place-items-center text-[13px]" style={{ color: C.ink3 }}>Nenhum compromisso agendado.</div>
  return (
    <div className="mx-auto max-w-[760px] px-5 py-5">
      {grupos.map((g) => (
        <div key={g.label} className="mb-5">
          <div className="mb-2 text-[11px] font-semibold uppercase capitalize tracking-[0.07em]" style={{ color: C.ink3 }}>{g.label}</div>
          <div className="overflow-hidden rounded-[12px] border" style={{ borderColor: C.line, background: C.card }}>
            {g.itens.map((e, i) => {
              const t = TIPOS[e.tipo] ?? TIPOS.tarefa
              return (
                <div key={e.id} className="flex items-center gap-3 p-3.5" style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                  <button onClick={() => onToggle(e)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full border" style={e.concluida ? { background: C.teal, borderColor: C.teal } : { borderColor: '#cbd5db' }}>{e.concluida && <Check size={14} strokeWidth={3} className="text-white" />}</button>
                  <span className="w-12 shrink-0 text-[13.5px] font-semibold" style={{ color: C.ink }}>{hhmm(e.vencimento as string)}</span>
                  <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: C.ink3 }}><t.icon size={13} /></span>
                  <span className="flex-1 truncate text-[13.5px]" style={{ color: C.ink, textDecoration: e.concluida ? 'line-through' : 'none' }}>{e.titulo}</span>
                  {e.lead_nome && <span className="truncate text-[12px]" style={{ color: C.ink3 }}>{e.lead_nome}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
