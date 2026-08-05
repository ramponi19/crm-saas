'use client'

import { useState } from 'react'
import { Plus, Clock, Phone, CalendarDays, Check, Users, Video, ListTodo, X } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

export interface Compromisso {
  id: number; titulo: string; descricao: string | null; tipo: string
  vencimento: string | null; concluida: boolean; lead_id: number | null
  lead_nome: string | null; lead_tel: string | null
}

const TIPOS: Record<string, { label: string; icon: typeof Clock }> = {
  ligacao: { label: 'Ligação', icon: Phone },
  reuniao: { label: 'Reunião', icon: Video },
  followup: { label: 'Follow-up', icon: Users },
  tarefa: { label: 'Tarefa', icon: ListTodo },
}

const key = (iso: string) => new Date(iso).toISOString().slice(0, 10)
const diaLabel = (iso: string) => {
  const d = new Date(iso); const hoje = new Date()
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  if (key(iso) === key(hoje.toISOString())) return 'Hoje'
  if (key(iso) === key(amanha.toISOString())) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
const hora = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'

export function CompromissosView({ iniciais }: { iniciais: Compromisso[] }) {
  const [lista, setLista] = useState<Compromisso[]>(iniciais)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const vazio = { titulo: '', tipo: 'tarefa', vencimento: '', descricao: '' }
  const [form, setForm] = useState(vazio)

  async function toggle(c: Compromisso) {
    const novo = !c.concluida
    setLista((l) => l.map((x) => x.id === c.id ? { ...x, concluida: novo } : x))
    await fetch(`/api/tracker/compromissos/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concluida: novo }),
    }).catch(() => setLista((l) => l.map((x) => x.id === c.id ? { ...x, concluida: !novo } : x)))
  }

  async function salvar() {
    if (!form.titulo.trim()) return
    setSalvando(true)
    try {
      const r = await fetch('/api/tracker/compromissos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error()
      setLista((l) => [...l, {
        id: d.id, titulo: form.titulo, descricao: form.descricao || null, tipo: form.tipo,
        vencimento: form.vencimento ? new Date(form.vencimento).toISOString() : null,
        concluida: false, lead_id: null, lead_nome: null, lead_tel: null,
      }].sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? '')))
      setForm(vazio); setModal(false)
    } finally { setSalvando(false) }
  }

  // Agrupa por dia (sem vencimento vai para "Sem data").
  const grupos: { label: string; itens: Compromisso[] }[] = []
  for (const c of lista) {
    const lbl = c.vencimento ? diaLabel(c.vencimento) : 'Sem data'
    const g = grupos.find((x) => x.label === lbl)
    if (g) g.itens.push(c); else grupos.push({ label: lbl, itens: [c] })
  }

  return (
    <div className="px-5 py-5 sm:px-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Compromissos</h1>
          <p className="text-[13px]" style={{ color: C.ink3 }}>Agenda, reuniões e tarefas.</p>
        </div>
        <button onClick={() => { setForm(vazio); setModal(true) }}
          className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}>
          <Plus size={16} strokeWidth={2} /> Novo compromisso
        </button>
      </header>

      <div className="mx-auto w-full max-w-[820px]">
        {lista.length === 0 ? (
          <div className="grid min-h-[240px] place-items-center rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
            <div className="flex flex-col items-center gap-2 text-center" style={{ color: C.ink3 }}>
              <CalendarDays size={34} strokeWidth={1.5} />
              <span className="text-[14px]">Nenhum compromisso agendado.</span>
            </div>
          </div>
        ) : grupos.map((g) => (
          <div key={g.label} className="mb-5">
            <div className="mb-2 text-[11px] font-semibold uppercase capitalize tracking-[0.07em]" style={{ color: C.ink3 }}>{g.label}</div>
            <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
              {g.itens.map((c, i) => {
                const t = TIPOS[c.tipo] ?? TIPOS.tarefa
                const Icon = t.icon
                return (
                  <div key={c.id} className="flex items-center gap-3 p-4" style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                    <button onClick={() => toggle(c)} aria-label="Concluir"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors"
                      style={c.concluida ? { background: C.teal, borderColor: C.teal } : { borderColor: '#cbd5db' }}>
                      {c.concluida && <Check size={14} strokeWidth={3} className="text-white" />}
                    </button>
                    <div className="flex w-[52px] shrink-0 items-center justify-center gap-1" style={{ color: C.ink }}>
                      <Clock size={12} strokeWidth={1.9} style={{ color: C.ink3 }} />
                      <span className="text-[14px] font-semibold leading-none" style={{ fontFamily: 'var(--font-sora)' }}>{hora(c.vencimento)}</span>
                    </div>
                    <div className="min-w-0 flex-1 border-l pl-3" style={{ borderColor: C.line }}>
                      <div className="truncate text-[13.5px] font-semibold" style={{ color: C.ink, textDecoration: c.concluida ? 'line-through' : 'none', opacity: c.concluida ? 0.6 : 1 }}>{c.titulo}</div>
                      <div className="mt-0.5 flex items-center gap-3 text-[12px]" style={{ color: C.ink2 }}>
                        <span className="inline-flex items-center gap-1"><Icon size={12} strokeWidth={1.8} /> {t.label}</span>
                        {c.lead_nome && <span className="truncate">{c.lead_nome}</span>}
                        {c.lead_tel && <span className="inline-flex items-center gap-1"><Phone size={12} strokeWidth={1.8} />{c.lead_tel}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal criar */}
      {modal && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) setModal(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-[440px] rounded-[16px] border p-5" style={{ background: C.card, borderColor: C.line }}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Novo compromisso</h2>
              <button onClick={() => setModal(false)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.ink3 }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <Campo label="Título">
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ligar para o cliente" className="tk-input" />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Tipo">
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="tk-input">
                    {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
                  </select>
                </Campo>
                <Campo label="Data e hora">
                  <input type="datetime-local" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className="tk-input" />
                </Campo>
              </div>
              <Campo label="Descrição (opcional)">
                <textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="tk-input resize-none" />
              </Campo>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(false)} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ color: C.ink2 }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.titulo.trim()} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`.tk-input{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13.5px;color:${C.ink};background:#fff;outline:none}.tk-input:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>{label}</span>
      {children}
    </label>
  )
}
