'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Send, Check, CheckCheck, MessageSquareDashed, UserPlus, Tag, Wallet, GitBranch, Phone } from 'lucide-react'

const C = {
  card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec',
  teal: '#00a884', tealDark: '#007e5f', chatBg: '#eae6df', bubbleOut: '#d9fdd3', bubbleIn: '#ffffff',
}

interface Conversa {
  id: number; nome: string; telefone: string | null; foto_url: string | null
  origem: string; status: string | null; nao_lidas: number; preview: string; preview_saida: boolean; ts: string | null
}
interface Mensagem { id: number; direcao: string; conteudo: string; tipo: string; midia_url: string | null; status_entrega: string | null; created_at: string }
interface LeadInfo {
  id: number; nome: string; telefone: string | null; origem_id: string | null; foto_url: string | null
  origem: string; status: string | null; etapa_label: string | null; valor: number | null; produto: string | null; responsavel_id: string | null
}

const horaBR = (s: string | null) => s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
const iniciais = (n: string) => n.trim().slice(0, 2).toUpperCase()
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Filtro = 'todas' | 'aguardando' | 'naolidas'
type Aba = 'inbox' | 'distribuir'

export function Inbox({ conversasIniciais }: { conversasIniciais: Conversa[] }) {
  const [conversas, setConversas] = useState<Conversa[]>(conversasIniciais)
  const [aba, setAba] = useState<Aba>('inbox')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<number | null>(conversasIniciais[0]?.id ?? null)
  const [lead, setLead] = useState<LeadInfo | null>(null)
  const [msgs, setMsgs] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  async function abrir(id: number) {
    setSel(id); setCarregando(true)
    try {
      const r = await fetch(`/api/tracker/conversas/${id}`)
      const d = await r.json()
      setLead(d.lead); setMsgs(d.mensagens ?? [])
      setConversas((cs) => cs.map((c) => c.id === id ? { ...c, nao_lidas: 0 } : c))
    } finally { setCarregando(false) }
  }
  useEffect(() => {
    if (sel != null) abrir(sel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function enviar() {
    const t = texto.trim(); if (!t || !lead || enviando) return
    setEnviando(true)
    const destino = lead.origem_id || lead.telefone
    const otim: Mensagem = { id: Date.now(), direcao: 'enviada', conteudo: t, tipo: 'texto', midia_url: null, status_entrega: 'enviando', created_at: new Date().toISOString() }
    setMsgs((m) => [...m, otim]); setTexto('')
    try {
      const r = await fetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: destino, message: t }) })
      const d = await r.json()
      setMsgs((m) => m.map((x) => x.id === otim.id ? { ...x, status_entrega: r.ok && d.success ? 'enviada' : 'falhou' } : x))
    } catch { setMsgs((m) => m.map((x) => x.id === otim.id ? { ...x, status_entrega: 'falhou' } : x)) } finally { setEnviando(false) }
  }

  async function assumir(id: number) {
    await fetch(`/api/tracker/conversas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assumir: true }) }).catch(() => {})
    if (lead?.id === id) setLead((l) => l ? { ...l, responsavel_id: 'me' } : l)
  }

  const filtradas = conversas.filter((c) => {
    const q = busca.toLowerCase()
    const okBusca = !q || c.nome.toLowerCase().includes(q) || (c.telefone ?? '').includes(busca)
    const okFiltro = filtro === 'todas' || (filtro === 'aguardando' ? !c.preview_saida : c.nao_lidas > 0)
    return okBusca && okFiltro
  })
  const aguardando = conversas.filter((c) => !c.preview_saida).length
  const naoLidas = conversas.filter((c) => c.nao_lidas > 0).length

  return (
    <div className="flex h-full min-h-0">
      {/* Coluna esquerda */}
      <aside className="flex w-full max-w-[330px] shrink-0 flex-col border-r" style={{ borderColor: C.line, background: C.card }}>
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <h1 className="text-[17px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Central de conversas</h1>
          <div className="flex items-center gap-1.5">
            <button title="Nova conversa" className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: C.teal }}><UserPlus size={15} /></button>
            <button title="Status, atribuição e agente IA" className="grid h-8 w-8 place-items-center rounded-full" style={{ background: '#f1f4f6', color: C.ink2 }}><Tag size={15} /></button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 border-b px-3" style={{ borderColor: C.line }}>
          {(['inbox', 'distribuir'] as Aba[]).map((a) => (
            <button key={a} onClick={() => setAba(a)} className="rounded-t-[8px] px-3 py-2 text-[13px] font-semibold capitalize transition-colors" style={aba === a ? { color: C.tealDark, borderBottom: `2px solid ${C.teal}` } : { color: C.ink3 }}>{a === 'inbox' ? 'Inbox' : 'Distribuir'}</button>
          ))}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: '#f1f4f6' }}>
            <Search size={16} style={{ color: C.ink3 }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa" className="w-full bg-transparent text-[13.5px] outline-none" style={{ color: C.ink }} />
          </div>
          <div className="mt-2 flex gap-1.5">
            {([['todas', 'Todas'], ['aguardando', `Aguardando resposta (${aguardando})`], ['naolidas', `Não lidas (${naoLidas})`]] as [Filtro, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setFiltro(v)} className="rounded-[8px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors" style={filtro === v ? { background: 'rgba(0,168,132,0.12)', color: C.tealDark } : { color: C.ink3, background: '#f1f4f6' }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtradas.length === 0 ? <div className="grid place-items-center py-16 text-[13px]" style={{ color: C.ink3 }}>Nenhuma conversa.</div> : filtradas.map((c) => {
            const ativo = c.id === sel
            return (
              <div key={c.id} className="flex items-center gap-2 px-2" style={{ background: ativo ? '#f0faf7' : 'transparent', borderLeft: ativo ? `3px solid ${C.teal}` : '3px solid transparent' }}>
                <button onClick={() => abrir(c.id)} className="flex flex-1 items-center gap-3 py-2.5 text-left">
                  <Avatar nome={c.nome} url={c.foto_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-[14px] font-semibold" style={{ color: C.ink }}>{c.nome}</span><span className="shrink-0 text-[11px]" style={{ color: C.ink3 }}>{horaBR(c.ts)}</span></div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px]" style={{ color: C.ink3 }}>{c.preview_saida ? 'Você: ' : ''}{c.preview || '—'}</span>
                      {c.nao_lidas > 0 && <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: C.teal }}>{c.nao_lidas}</span>}
                    </div>
                  </div>
                </button>
                {aba === 'distribuir' && (
                  <button onClick={() => assumir(c.id)} title="Assumir" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><UserPlus size={15} /></button>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* Thread */}
      <section className="flex min-w-0 flex-1 flex-col" style={{ background: C.chatBg }}>
        {!lead ? (
          <div className="grid flex-1 place-items-center"><div className="flex flex-col items-center gap-2 text-center" style={{ color: C.ink3 }}><MessageSquareDashed size={40} strokeWidth={1.5} /><span className="text-[14px]">Selecione uma conversa</span></div></div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-2.5" style={{ background: C.card, borderColor: C.line }}>
              <Avatar nome={lead.nome} url={lead.foto_url} />
              <div className="min-w-0"><div className="truncate text-[14.5px] font-semibold" style={{ color: C.ink }}>{lead.nome}</div><div className="truncate text-[12px]" style={{ color: C.ink3 }}>{lead.telefone || lead.origem}</div></div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-10">
              {carregando ? <div className="grid place-items-center py-10 text-[13px]" style={{ color: C.ink3 }}>Carregando…</div> : msgs.length === 0 ? <div className="grid place-items-center py-10 text-[13px]" style={{ color: C.ink3 }}>Sem mensagens ainda.</div> : msgs.map((m) => {
                const saida = m.direcao === 'enviada'
                return (
                  <div key={m.id} className="mb-1.5 flex" style={{ justifyContent: saida ? 'flex-end' : 'flex-start' }}>
                    <div className="max-w-[76%] rounded-[9px] px-2.5 py-1.5 shadow-sm" style={{ background: saida ? C.bubbleOut : C.bubbleIn }}>
                      {m.midia_url && m.tipo === 'imagem' && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.midia_url} alt="" className="mb-1 max-h-60 rounded-[6px]" />
                      )}
                      <span className="whitespace-pre-wrap break-words text-[13.5px]" style={{ color: C.ink }}>{m.conteudo}</span>
                      <span className="ml-2 inline-flex items-center gap-0.5 align-bottom text-[10px]" style={{ color: C.ink3 }}>
                        {horaBR(m.created_at)}
                        {saida && (m.status_entrega === 'lida' ? <CheckCheck size={13} style={{ color: '#53bdeb' }} /> : m.status_entrega === 'entregue' ? <CheckCheck size={13} /> : m.status_entrega === 'falhou' ? <span style={{ color: '#e11d48' }}>✕</span> : <Check size={13} />)}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div ref={fimRef} />
            </div>
            <div className="flex items-end gap-2 border-t px-4 py-3" style={{ background: C.card, borderColor: C.line }}>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} rows={1} placeholder="Mensagem" className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[10px] px-3 py-2.5 text-[13.5px] outline-none" style={{ background: '#f1f4f6', color: C.ink }} />
              <button onClick={enviar} disabled={enviando || !texto.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-opacity disabled:opacity-40" style={{ background: C.teal }}><Send size={17} strokeWidth={2} /></button>
            </div>
          </>
        )}
      </section>

      {/* Painel CRM lateral */}
      {lead && (
        <aside className="hidden w-[260px] shrink-0 border-l lg:block" style={{ borderColor: C.line, background: C.card }}>
          <div className="border-b p-4 text-center" style={{ borderColor: C.line }}>
            <div className="mx-auto"><Avatar nome={lead.nome} url={lead.foto_url} big /></div>
            <div className="mt-2 text-[14.5px] font-semibold" style={{ color: C.ink }}>{lead.nome}</div>
            {lead.telefone && <div className="inline-flex items-center gap-1 text-[12px]" style={{ color: C.ink3 }}><Phone size={12} />{lead.telefone}</div>}
            {!lead.responsavel_id && <button onClick={() => assumir(lead.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: C.teal }}><UserPlus size={13} /> Assumir conversa</button>}
          </div>
          <div className="space-y-3 p-4">
            <Campo icon={<GitBranch size={14} />} label="Etapa" valor={lead.etapa_label || lead.status || '—'} />
            <Campo icon={<Wallet size={14} />} label="Valor" valor={lead.valor != null && lead.valor > 0 ? brl(lead.valor) : '—'} />
            <Campo icon={<Tag size={14} />} label="Produto" valor={lead.produto || '—'} />
            <Campo icon={<Tag size={14} />} label="Origem" valor={lead.origem || '—'} />
          </div>
        </aside>
      )}
    </div>
  )
}

function Campo({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: C.ink3 }}>{icon}{label}</span>
      <span className="truncate text-[12.5px] font-semibold" style={{ color: C.ink }}>{valor}</span>
    </div>
  )
}

function Avatar({ nome, url, big }: { nome: string; url: string | null; big?: boolean }) {
  const sz = big ? 'h-16 w-16 text-[20px]' : 'h-10 w-10 text-[13px]'
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${big ? 'h-16 w-16' : 'h-10 w-10'} shrink-0 rounded-full object-cover`} />
  }
  return <span className={`grid ${sz} shrink-0 place-items-center rounded-full font-bold text-white`} style={{ background: '#00a884' }}>{iniciais(nome)}</span>
}
