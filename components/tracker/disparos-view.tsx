'use client'

import { useState } from 'react'
import { Plus, Send, Play, Pause, CheckCheck, Trash2, ArrowLeft, ArrowRight, Check } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f', warn: '#b7791f' }

export interface Campanha { id: number; nome: string; status: string; mensagem: string | null; publico_tipo: string; publico_valor: string | null; total_alvos: number; enviados: number; agendado_para: string | null; criado_em: string }
interface Opt { slug: string; label: string }

const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  rascunho: { label: 'Rascunho', cor: C.ink3, bg: '#f1f4f6' }, ativa: { label: 'Ativa', cor: C.tealDark, bg: 'rgba(0,168,132,0.10)' },
  pausada: { label: 'Pausada', cor: C.warn, bg: '#fdf6e9' }, concluida: { label: 'Concluída', cor: '#3a4b57', bg: '#eef1f5' },
}
const FILTROS = [['todas', 'Todas'], ['ativa', 'Ativa'], ['pausada', 'Pausada'], ['rascunho', 'Rascunho'], ['concluida', 'Concluída']] as const
const OBJETIVOS = ['Prospecção ativa', 'Reengajamento de leads', 'Pós-venda / fidelização', 'Aviso / comunicado']
const PASSOS = ['Informações básicas', 'Público-alvo', 'Mensagem', 'Revisão']

export function DisparosView({ iniciais, etapas, origens, canais }: { iniciais: Campanha[]; etapas: Opt[]; origens: string[]; canais: string[] }) {
  const [lista, setLista] = useState<Campanha[]>(iniciais)
  const [filtro, setFiltro] = useState<string>('todas')
  const [wizard, setWizard] = useState(false)
  const [passo, setPasso] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const vazio = { nome: '', objetivo: OBJETIVOS[0], canal: '', publico_tipo: 'todos', publico_valor: '', mensagem: '' }
  const [f, setF] = useState(vazio)

  const filtradas = filtro === 'todas' ? lista : lista.filter((c) => c.status === filtro)

  async function criar() {
    if (!f.nome.trim()) return
    setSalvando(true)
    try {
      const r = await fetch('/api/tracker/disparos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: f.nome, mensagem: f.mensagem, publico_tipo: f.publico_tipo, publico_valor: f.publico_valor }) })
      const d = await r.json()
      if (r.ok) { setLista((l) => [d.campanha, ...l]); setWizard(false); setF(vazio); setPasso(0) }
    } finally { setSalvando(false) }
  }
  async function mudarStatus(c: Campanha, status: string) { setLista((l) => l.map((x) => x.id === c.id ? { ...x, status } : x)); await fetch(`/api/tracker/disparos/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => {}) }
  async function remover(c: Campanha) { if (!confirm('Excluir?')) return; const r = await fetch(`/api/tracker/disparos/${c.id}`, { method: 'DELETE' }); if (r.ok) setLista((l) => l.filter((x) => x.id !== c.id)) }

  const publicoLabel = f.publico_tipo === 'todos' ? 'Todos os leads' : f.publico_tipo === 'etapa' ? `Etapa: ${etapas.find((e) => e.slug === f.publico_valor)?.label ?? '—'}` : `Origem: ${f.publico_valor || '—'}`

  if (wizard) {
    return (
      <div className="px-5 py-5 sm:px-7">
        <button onClick={() => { setWizard(false); setPasso(0) }} className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: C.ink2 }}><ArrowLeft size={15} /> Cancelar</button>
        <h1 className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Nova campanha</h1>
        <p className="text-[13px]" style={{ color: C.ink3 }}>Configure em poucos passos.</p>

        {/* Stepper */}
        <div className="my-5 flex items-center">
          {PASSOS.map((p, i) => (
            <div key={p} className="flex items-center" style={{ flex: i < PASSOS.length - 1 ? 1 : '0 0 auto' }}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold" style={i <= passo ? { background: C.teal, color: '#fff' } : { background: '#e7edf0', color: C.ink3 }}>{i < passo ? <Check size={15} strokeWidth={3} /> : i + 1}</span>
              {i < PASSOS.length - 1 && <span className="mx-1 h-[2px] flex-1" style={{ background: i < passo ? C.teal : '#e7edf0' }} />}
            </div>
          ))}
        </div>

        <div className="mx-auto max-w-[560px] rounded-[14px] border p-5" style={{ borderColor: C.line, background: C.card }}>
          {passo === 0 && (
            <>
              <h3 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Informações básicas</h3>
              <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Nome, objetivo e canal de envio.</p>
              <label className="mb-3 block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Nome da campanha</span><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className="tk-di" placeholder="Ex.: Prospecção abril" /></label>
              <label className="mb-3 block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Objetivo</span><select value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} className="tk-di">{OBJETIVOS.map((o) => <option key={o}>{o}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Canal WhatsApp</span><select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} className="tk-di"><option value="">Selecione o canal</option>{canais.map((c) => <option key={c}>{c}</option>)}</select></label>
            </>
          )}
          {passo === 1 && (
            <>
              <h3 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Público-alvo</h3>
              <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Quem vai receber a campanha.</p>
              <label className="mb-3 block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Segmento</span><select value={f.publico_tipo} onChange={(e) => setF({ ...f, publico_tipo: e.target.value, publico_valor: '' })} className="tk-di"><option value="todos">Todos os leads</option><option value="etapa">Por etapa do funil</option><option value="origem">Por origem</option></select></label>
              {f.publico_tipo === 'etapa' && <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Etapa</span><select value={f.publico_valor} onChange={(e) => setF({ ...f, publico_valor: e.target.value })} className="tk-di"><option value="">— selecione —</option>{etapas.map((et) => <option key={et.slug} value={et.slug}>{et.label}</option>)}</select></label>}
              {f.publico_tipo === 'origem' && <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Origem</span><select value={f.publico_valor} onChange={(e) => setF({ ...f, publico_valor: e.target.value })} className="tk-di"><option value="">— selecione —</option>{origens.map((o) => <option key={o}>{o}</option>)}</select></label>}
            </>
          )}
          {passo === 2 && (
            <>
              <h3 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Mensagem</h3>
              <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Fora da janela de 24h, o WhatsApp exige modelo aprovado.</p>
              <textarea rows={5} value={f.mensagem} onChange={(e) => setF({ ...f, mensagem: e.target.value })} className="tk-di resize-none" placeholder="Olá {{nome}}, temos uma novidade para você..." />
            </>
          )}
          {passo === 3 && (
            <>
              <h3 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Revisão</h3>
              <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Confira antes de criar (a campanha nasce como rascunho).</p>
              <div className="space-y-2 text-[13px]">
                <Rev l="Nome" v={f.nome || '—'} /><Rev l="Objetivo" v={f.objetivo} /><Rev l="Canal" v={f.canal || 'Selecione o canal'} /><Rev l="Público" v={publicoLabel} /><Rev l="Mensagem" v={f.mensagem ? f.mensagem.slice(0, 60) + (f.mensagem.length > 60 ? '…' : '') : '—'} />
              </div>
            </>
          )}
        </div>

        <div className="mx-auto mt-4 flex max-w-[560px] items-center justify-between">
          <button onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={passo === 0} className="inline-flex items-center gap-1 rounded-[10px] border px-4 py-2 text-[13px] font-semibold disabled:opacity-40" style={{ borderColor: C.line, color: C.ink2 }}><ArrowLeft size={15} /> Anterior</button>
          {passo < 3 ? <button onClick={() => setPasso((p) => p + 1)} disabled={passo === 0 && !f.nome.trim()} className="inline-flex items-center gap-1 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: C.teal }}>Próximo <ArrowRight size={15} /></button>
            : <button onClick={criar} disabled={salvando} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Criar campanha</button>}
        </div>
        <style>{`.tk-di{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13.5px;color:${C.ink};background:#fff;outline:none}.tk-di:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
      </div>
    )
  }

  return (
    <div className="px-5 py-5 sm:px-7">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Disparos</h1><p className="text-[13px]" style={{ color: C.ink3 }}>Campanhas de mensagens em massa pelo WhatsApp.</p></div>
        <button onClick={() => { setF(vazio); setPasso(0); setWizard(true) }} className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}><Plus size={16} strokeWidth={2} /> Nova Campanha</button>
      </header>
      <div className="mb-4 flex flex-wrap gap-1.5">{FILTROS.map(([v, l]) => <button key={v} onClick={() => setFiltro(v)} className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors" style={filtro === v ? { background: C.teal, color: '#fff' } : { background: C.card, color: C.ink2, border: `1px solid ${C.line}` }}>{l}</button>)}</div>
      {filtradas.length === 0 ? (
        <div className="grid min-h-[240px] place-items-center rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}><div className="flex flex-col items-center gap-2 text-center" style={{ color: C.ink3 }}><Send size={34} strokeWidth={1.5} /><span className="text-[14px]">Nenhuma campanha ainda.</span><button onClick={() => setWizard(true)} className="mt-1 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}>Criar campanha</button></div></div>
      ) : (
        <div className="space-y-2">{filtradas.map((c) => { const st = STATUS[c.status] ?? STATUS.rascunho; const pct = c.total_alvos ? Math.round((c.enviados / c.total_alvos) * 100) : 0; return (
          <div key={c.id} className="rounded-[14px] border p-4" style={{ borderColor: C.line, background: C.card }}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-[14px] font-semibold" style={{ color: C.ink }}>{c.nome}</span><span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.cor }}>{st.label}</span></div><div className="mt-0.5 text-[12px]" style={{ color: C.ink3 }}>{c.total_alvos} destinatário(s) · {c.enviados} enviado(s)</div></div>
              <div className="flex items-center gap-1">
                {c.status !== 'ativa' && c.status !== 'concluida' && <IconBtn title="Ativar" onClick={() => mudarStatus(c, 'ativa')}><Play size={15} /></IconBtn>}
                {c.status === 'ativa' && <IconBtn title="Pausar" onClick={() => mudarStatus(c, 'pausada')}><Pause size={15} /></IconBtn>}
                {c.status !== 'concluida' && <IconBtn title="Concluir" onClick={() => mudarStatus(c, 'concluida')}><CheckCheck size={15} /></IconBtn>}
                <IconBtn title="Excluir" onClick={() => remover(c)}><Trash2 size={15} /></IconBtn>
              </div>
            </div>
            {c.total_alvos > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: '#eef1f5' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.teal }} /></div>}
          </div>
        ) })}</div>
      )}
    </div>
  )
}
function Rev({ l, v }: { l: string; v: string }) { return <div className="flex items-start justify-between gap-3"><span style={{ color: C.ink3 }}>{l}</span><span className="text-right font-semibold" style={{ color: C.ink }}>{v}</span></div> }
function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) { return <button title={title} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-[9px] transition-colors hover:bg-[#eef1f5]" style={{ color: C.ink2 }}>{children}</button> }
