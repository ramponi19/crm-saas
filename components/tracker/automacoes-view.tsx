'use client'

import { useEffect, useState } from 'react'
import { Zap, Sparkles, Plus, X, Trash2, ArrowRight, BookOpen } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

interface Acao { tipo: string; config?: string }
interface Automacao { id: number; nome: string; ativo: boolean; gatilho: string; acoes: Acao[]; execucoes: number }

const GATILHOS: Record<string, string> = {
  nova_oportunidade: 'Nova oportunidade no funil',
  lead_parado: 'Lead parado (sem resposta)',
  formulario: 'Formulário recebido',
  etapa_mudou: 'Lead mudou de etapa',
}
const ACOES: Record<string, string> = {
  qualificar_ia: 'Qualificar com IA',
  enviar_mensagem: 'Enviar mensagem',
  criar_tarefa: 'Criar tarefa',
  mover_etapa: 'Mover de etapa',
  notificar: 'Notificar equipe',
}
const PRONTAS: { nome: string; gatilho: string; acoes: Acao[]; desc: string }[] = [
  { nome: 'Nova oportunidade → qualificar', gatilho: 'nova_oportunidade', acoes: [{ tipo: 'qualificar_ia' }], desc: 'Agente de IA qualifica o lead assim que entra no pipeline.' },
  { nome: 'Lead parado → follow-up', gatilho: 'lead_parado', acoes: [{ tipo: 'enviar_mensagem', config: 'Oi! Ainda tem interesse?' }], desc: 'Oportunidade sem resposta recebe mensagem após X dias.' },
  { nome: 'Formulário → WhatsApp', gatilho: 'formulario', acoes: [{ tipo: 'enviar_mensagem', config: 'Recebemos seu contato, já vamos te chamar!' }], desc: 'Lead do site cai no funil e recebe boas-vindas.' },
]

export function AutomacoesView() {
  const [lista, setLista] = useState<Automacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<{ nome: string; gatilho: string; acoes: Acao[] }>({ nome: '', gatilho: 'nova_oportunidade', acoes: [{ tipo: 'qualificar_ia' }] })

  async function carregar() { const r = await fetch('/api/tracker/automacoes'); const d = await r.json(); setLista(d.automacoes ?? []); setCarregando(false) }
  useEffect(() => { carregar() }, [])

  async function criar(payload?: { nome: string; gatilho: string; acoes: Acao[] }) {
    const p = payload ?? form
    if (!p.nome.trim()) return
    setSalvando(true)
    try {
      const r = await fetch('/api/tracker/automacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      const d = await r.json()
      if (r.ok) { setLista((l) => [d.automacao, ...l]); setModal(false); setForm({ nome: '', gatilho: 'nova_oportunidade', acoes: [{ tipo: 'qualificar_ia' }] }) }
    } finally { setSalvando(false) }
  }
  async function toggle(a: Automacao) {
    const ativo = !a.ativo; setLista((l) => l.map((x) => x.id === a.id ? { ...x, ativo } : x))
    await fetch(`/api/tracker/automacoes/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo }) }).catch(() => {})
  }
  async function remover(a: Automacao) {
    if (!confirm('Excluir esta automação?')) return
    const r = await fetch(`/api/tracker/automacoes/${a.id}`, { method: 'DELETE' }); if (r.ok) setLista((l) => l.filter((x) => x.id !== a.id))
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-[18px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}><Zap size={20} strokeWidth={1.9} style={{ color: C.teal }} /> Automações</h1>
      <p className="mb-4 mt-0.5 text-[13px]" style={{ color: C.ink3 }}>Executadas automaticamente quando um evento ocorre. Use prontas ou monte no Builder.</p>

      {/* Assistente por IA */}
      <div className="mb-4 rounded-[14px] border p-5" style={{ borderColor: '#cfe8df', background: '#f6faf8' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] text-white" style={{ background: C.teal }}><Sparkles size={19} strokeWidth={1.9} /></span>
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.tealDark }}>Assistente de automações</div>
              <div className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Crie fluxos conversando — sem abrir o editor</div>
            </div>
          </div>
          <button title="Requer conexão da IA" className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white opacity-60" style={{ background: C.teal }} disabled><Sparkles size={15} /> Criar com IA (conecte a IA)</button>
        </div>
      </div>

      {/* Prontas */}
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}><BookOpen size={14} /> Automações prontas</h2>
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        {PRONTAS.map((p) => (
          <div key={p.nome} className="rounded-[14px] border p-4" style={{ borderColor: C.line, background: C.card }}>
            <div className="text-[13.5px] font-semibold" style={{ color: C.ink }}>{p.nome}</div>
            <p className="mt-1 min-h-[48px] text-[12.5px]" style={{ color: C.ink2 }}>{p.desc}</p>
            <button onClick={() => criar(p)} className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: C.tealDark }}><Plus size={13} /> Usar esta</button>
          </div>
        ))}
      </div>

      {/* Lista + Novo fluxo */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}>Seus fluxos</h2>
        <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}><Plus size={16} strokeWidth={2} /> Novo fluxo</button>
      </div>

      {carregando ? <div className="h-24 animate-pulse rounded-[14px]" style={{ background: 'rgba(0,0,0,0.04)' }} /> : lista.length === 0 ? (
        <div className="grid min-h-[160px] place-items-center rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
          <div className="flex flex-col items-center gap-2 text-center" style={{ color: C.ink3 }}><Zap size={30} strokeWidth={1.5} /><span className="text-[13px]">Nenhuma automação ainda.</span></div>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border p-4" style={{ borderColor: C.line, background: C.card }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.ativo ? C.teal : '#cbd5db' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold" style={{ color: C.ink }}>{a.nome}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: C.ink3 }}>
                  <span className="rounded-[5px] px-1.5 py-0.5" style={{ background: '#eef1f5', color: C.ink2 }}>{GATILHOS[a.gatilho] ?? a.gatilho}</span>
                  {(a.acoes ?? []).map((ac, i) => <span key={i} className="inline-flex items-center gap-1"><ArrowRight size={11} /><span className="rounded-[5px] px-1.5 py-0.5" style={{ background: 'rgba(0,168,132,0.10)', color: C.tealDark }}>{ACOES[ac.tipo] ?? ac.tipo}</span></span>)}
                </div>
              </div>
              <button onClick={() => toggle(a)} className="rounded-[8px] px-2.5 py-1 text-[12px] font-semibold" style={a.ativo ? { background: 'rgba(0,168,132,0.10)', color: C.tealDark } : { background: '#eef1f5', color: C.ink3 }}>{a.ativo ? 'Ativa' : 'Pausada'}</button>
              <button onClick={() => remover(a)} aria-label="Excluir" className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ color: C.ink3 }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Builder */}
      {modal && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) setModal(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-[520px] rounded-[16px] border p-5" style={{ background: C.card, borderColor: C.line }}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-[16px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Novo fluxo</h2><button onClick={() => setModal(false)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.ink3 }}><X size={18} /></button></div>
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Nome</span><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="tk-au" placeholder="Ex.: Qualificar novos leads" /></label>
              <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Quando (gatilho)</span>
                <select value={form.gatilho} onChange={(e) => setForm({ ...form, gatilho: e.target.value })} className="tk-au">{Object.entries(GATILHOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
              <div>
                <div className="mb-1 flex items-center justify-between"><span className="text-[12px] font-medium" style={{ color: C.ink2 }}>Então (ações)</span><button onClick={() => setForm((f) => ({ ...f, acoes: [...f.acoes, { tipo: 'enviar_mensagem' }] }))} className="text-[12px] font-semibold" style={{ color: C.tealDark }}>+ ação</button></div>
                <div className="space-y-2">
                  {form.acoes.map((ac, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={ac.tipo} onChange={(e) => setForm((f) => ({ ...f, acoes: f.acoes.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x) }))} className="tk-au flex-1">{Object.entries(ACOES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      {form.acoes.length > 1 && <button onClick={() => setForm((f) => ({ ...f, acoes: f.acoes.filter((_, j) => j !== i) }))} className="grid h-8 w-8 place-items-center rounded-[8px]" style={{ color: C.ink3 }}><X size={15} /></button>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ color: C.ink2 }}>Cancelar</button><button onClick={() => criar()} disabled={salvando || !form.nome.trim()} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Criar fluxo</button></div>
          </div>
        </div>
      )}
      <style>{`.tk-au{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13.5px;color:${C.ink};background:#fff;outline:none}.tk-au:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}
