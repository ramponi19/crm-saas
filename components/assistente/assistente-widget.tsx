'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, X, Send, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'model'; text: string }

const SUGESTOES = [
  'Como faço uma venda no PDV?',
  'Onde vejo o faturamento do mês?',
  'Como lanço um orçamento de troca?',
]

// Nome amigável da tela atual, para dar contexto ao assistente.
function telaLabel(path: string): string {
  const seg = path.split('/').filter(Boolean)[0] ?? 'dashboard'
  const map: Record<string, string> = {
    dashboard: 'Dashboard', pdv: 'PDV', historico: 'Histórico', estoque: 'Estoque',
    catalogo: 'Produtos', orcamentos: 'Orçamentos', leads: 'Leads', clientes: 'Clientes',
    assistencia: 'Assistência', compras: 'Compras', financeiro: 'Financeiro', relatorios: 'Relatórios',
  }
  return map[seg] ?? seg
}

export function AssistenteWidget() {
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading])

  async function enviar(texto: string) {
    const t = texto.trim()
    if (!t || loading) return
    const novo: Msg[] = [...msgs, { role: 'user', text: t }]
    setMsgs(novo)
    setInput('')
    setLoading(true)
    try {
      const r = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: novo, contexto: telaLabel(pathname) }),
      })
      const j = await r.json().catch(() => ({}))
      setMsgs((m) => [...m, {
        role: 'model',
        text: r.ok && j.resposta ? j.resposta : (j.error ?? 'Não consegui responder agora. Tente de novo.'),
      }])
    } catch {
      setMsgs((m) => [...m, { role: 'model', text: 'Falha de conexão. Tente de novo.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Assistente"
        className="fixed bottom-5 right-5 z-40 grid place-items-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ width: 52, height: 52 }}
      >
        {aberto ? <X size={22} strokeWidth={2} /> : <Sparkles size={22} strokeWidth={2} />}
      </button>

      {/* Painel */}
      {aberto && (
        <div className="fixed bottom-[84px] right-5 z-40 flex w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-card border border-line bg-card shadow-xl" style={{ height: 'min(560px, calc(100vh - 120px))' }}>
          <header className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent"><Bot size={17} strokeWidth={1.8} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">Assistente Nexus</div>
              <div className="text-[11px] text-ink-3">Tira dúvidas de como usar o sistema</div>
            </div>
            <button onClick={() => setAberto(false)} className="text-ink-3 hover:text-ink" aria-label="Fechar"><X size={18} strokeWidth={1.8} /></button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 scrollbar-thin">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-[12.5px] text-ink-2">Olá! 👋 Posso te ajudar a usar o CRM. Pergunte à vontade — ou comece por:</p>
                <div className="flex flex-col gap-1.5">
                  {SUGESTOES.map((s) => (
                    <button key={s} onClick={() => enviar(s)} className="rounded-control border border-line px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2 text-[12.5px] leading-relaxed',
                  m.role === 'user' ? 'bg-accent text-white' : 'bg-raised text-ink')}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
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
              className="h-9 min-w-0 flex-1 rounded-control border border-line bg-card px-3 text-[12.5px] text-ink outline-none focus:border-accent"
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
