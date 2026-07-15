'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, X, Send, Bot, Trash2, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'model'; text: string }

const STORE_KEY = 'nexus_assistente_v1'
const SUGESTOES = [
  'Como faço uma venda no PDV?',
  'Onde vejo o faturamento do mês?',
  'Como lanço um orçamento de troca?',
]
const CRIAR = [
  'Criar uma descrição de produto',
  'Criar um post para o Instagram',
  'Escrever uma mensagem para o cliente',
  'Melhorar um texto que eu vou colar',
]

function telaLabel(path: string): string {
  const seg = path.split('/').filter(Boolean)[0] ?? 'dashboard'
  const map: Record<string, string> = {
    dashboard: 'Dashboard', pdv: 'PDV', historico: 'Histórico', estoque: 'Estoque',
    catalogo: 'Produtos', orcamentos: 'Orçamentos', leads: 'Leads', clientes: 'Clientes',
    assistencia: 'Assistência', compras: 'Compras', financeiro: 'Financeiro', relatorios: 'Relatórios',
  }
  return map[seg] ?? seg
}

// ── Markdown leve (negrito + listas + parágrafos) — sem dependência ──
function inline(s: string, k: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${k}-${i}`} className="font-semibold">{p.slice(2, -2)}</strong>
      : <span key={`${k}-${i}`}>{p}</span>)
}
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let lista: { ord: boolean; itens: string[] } | null = null
  const flush = () => {
    if (!lista) return
    const items = lista.itens.map((it, i) => <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>)
    blocks.push(lista.ord
      ? <ol key={`b${blocks.length}`} className="list-decimal space-y-0.5 pl-5">{items}</ol>
      : <ul key={`b${blocks.length}`} className="list-disc space-y-0.5 pl-5">{items}</ul>)
    lista = null
  }
  text.split('\n').forEach((ln) => {
    const num = ln.match(/^\s*\d+[.)]\s+(.*)/)
    const bul = ln.match(/^\s*[-*•]\s+(.*)/)
    if (num) { if (!lista?.ord) { flush(); lista = { ord: true, itens: [] } } lista.itens.push(num[1]) }
    else if (bul) { if (!lista || lista.ord) { flush(); lista = { ord: false, itens: [] } } lista.itens.push(bul[1]) }
    else { flush(); if (ln.trim()) blocks.push(<p key={`b${blocks.length}`}>{inline(ln, `p${blocks.length}`)}</p>) }
  })
  flush()
  return <div className="space-y-1.5">{blocks}</div>
}

export function AssistenteWidget() {
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiado, setCopiado] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Restaura histórico do dispositivo.
  useEffect(() => {
    try { const s = localStorage.getItem(STORE_KEY); if (s) setMsgs(JSON.parse(s)) } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30))) } catch { /* ignore */ }
  }, [msgs])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading])

  function limpar() { setMsgs([]); try { localStorage.removeItem(STORE_KEY) } catch { /* ignore */ } }
  async function copiar(i: number, texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(i); setTimeout(() => setCopiado(null), 1500) } catch { /* ignore */ }
  }

  async function iniciarDia() {
    if (loading) return
    setMsgs((m) => [...m, { role: 'user', text: '☀️ Como iniciar meu dia?' }])
    setLoading(true)
    try {
      const r = await fetch('/api/assistente/meu-dia', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      setMsgs((m) => [...m, { role: 'model', text: r.ok && j.roteiro ? j.roteiro : (j.error ?? 'Não consegui montar o roteiro agora.') }])
    } catch {
      setMsgs((m) => [...m, { role: 'model', text: 'Falha de conexão. Tente de novo.' }])
    } finally {
      setLoading(false)
    }
  }

  async function enviar(texto: string) {
    const t = texto.trim()
    if (!t || loading) return
    const base: Msg[] = [...msgs, { role: 'user', text: t }]
    setMsgs(base)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: base, contexto: telaLabel(pathname) }),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        setMsgs((m) => [...m, { role: 'model', text: j.error ?? 'Não consegui responder agora. Tente de novo.' }])
        return
      }
      // Streaming: cria a bolha do assistente e vai preenchendo conforme chega.
      setMsgs((m) => [...m, { role: 'model', text: '' }])
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: 'model', text: acc }; return c })
      }
      if (!acc.trim()) setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: 'model', text: 'Sem resposta. Tente reformular.' }; return c })
    } catch {
      setMsgs((m) => [...m, { role: 'model', text: 'Falha de conexão. Tente de novo.' }])
    } finally {
      setLoading(false)
    }
  }

  const streaming = loading && msgs[msgs.length - 1]?.role === 'model'

  return (
    <>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Assistente"
        className="fixed bottom-5 right-5 z-40 grid place-items-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ width: 52, height: 52 }}
      >
        {aberto ? <X size={22} strokeWidth={2} /> : <Sparkles size={22} strokeWidth={2} />}
      </button>

      {aberto && (
        <div className="fixed bottom-[84px] right-5 z-40 flex w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-card border border-line bg-card shadow-xl" style={{ height: 'min(560px, calc(100vh - 120px))' }}>
          <header className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent"><Bot size={17} strokeWidth={1.8} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">Assistente Nexus</div>
              <div className="text-[11px] text-ink-3">Tira dúvidas de como usar o sistema</div>
            </div>
            {msgs.length > 0 && (
              <button onClick={limpar} className="text-ink-3 hover:text-bad" aria-label="Limpar conversa" title="Limpar conversa"><Trash2 size={16} strokeWidth={1.8} /></button>
            )}
            <button onClick={() => setAberto(false)} className="text-ink-3 hover:text-ink" aria-label="Fechar"><X size={18} strokeWidth={1.8} /></button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 scrollbar-thin">
            {msgs.length === 0 && (
              <div className="space-y-4">
                <p className="text-[12.5px] text-ink-2">Olá! 👋 Posso ajudar a <strong className="text-ink">usar o CRM</strong> e a <strong className="text-ink">criar conteúdo</strong> (descrição, post, mensagem).</p>
                <button onClick={iniciarDia} className="flex w-full items-center justify-center gap-2 rounded-control bg-accent px-3 py-2.5 text-[13px] font-semibold text-white transition-transform hover:scale-[1.01] active:scale-95">
                  ☀️ Iniciar o dia — meu roteiro
                </button>
                <div>
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Dúvidas rápidas</div>
                  <div className="flex flex-col gap-1.5">
                    {SUGESTOES.map((s) => (
                      <button key={s} onClick={() => enviar(s)} className="rounded-control border border-line px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent">{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Criar conteúdo</div>
                  <div className="flex flex-col gap-1.5">
                    {CRIAR.map((s) => (
                      <button key={s} onClick={() => enviar(s)} className="rounded-control border border-line px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent">✍️ {s}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn('group flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={cn('max-w-[86%] rounded-card px-3 py-2 text-[12.5px] leading-relaxed',
                  m.role === 'user' ? 'whitespace-pre-wrap bg-accent text-white' : 'bg-raised text-ink')}>
                  {m.role === 'user' ? m.text : <Markdown text={m.text} />}
                </div>
                {m.role === 'model' && m.text && (
                  <button onClick={() => copiar(i, m.text)} className="mt-1 flex items-center gap-1 text-[10.5px] text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100">
                    {copiado === i ? <><Check size={11} /> copiado</> : <><Copy size={11} /> copiar</>}
                  </button>
                )}
              </div>
            ))}
            {loading && !streaming && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-card bg-raised px-3 py-3">
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: '0ms' }} />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: '150ms' }} />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); enviar(input) }} className="flex items-center gap-2 border-t border-line-soft p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escreva sua dúvida…"
              className="h-10 min-w-0 flex-1 rounded-control border border-line bg-card px-3 text-base text-ink outline-none focus:border-accent sm:h-9 sm:text-[12.5px]"
            />
            <button type="submit" disabled={!input.trim() || loading} className="grid size-9 flex-none place-items-center rounded-control bg-accent text-white disabled:opacity-40" aria-label="Enviar">
              <Send size={16} strokeWidth={1.9} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
