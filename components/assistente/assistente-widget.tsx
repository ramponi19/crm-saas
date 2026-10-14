'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X, Send, Bot, Trash2, Copy, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnalisesPendentes } from '@/components/zapintel/robo-analises'

/**
 * O ASSISTENTE — UM CHAT SÓ PARA O CRM E O ZAPINTEL.
 *
 * Começou (15/07/2026) como ajuda de uso, sem acesso a dado nenhum. Em
 * 14/10/2026 o Lucas pediu o robô do ZapIntel como chat: *"consigo solicitar
 * nesse chat com o robo um pedido de relatorio, analise, e etc... respostas
 * dentro do sistema"*. Com a chave da Anthropic no servidor, a rota passa a
 * consultar vendas, leads e conversas (ver `lib/assistente/`); sem ela,
 * responde como antes. A tela entende os dois formatos.
 *
 * No ZapIntel, o topo do chat mostra as análises de IA que ficaram para trás
 * (`AnalisesPendentes`) e o robô carrega esse número no selo — abrir o chat
 * não gasta token; só o botão "Gerar" e as perguntas gastam.
 */

interface Msg { role: 'user' | 'model'; text: string }
type Variante = 'crm' | 'zapintel'

const STORE_KEY = 'nexus_assistente_v1'

const PERGUNTAS = [
  'Quem está esperando resposta da loja agora?',
  'Relatório de vendas desta semana',
  'Leads quentes sem resposta há mais de 2 dias',
  'Como foi o mês até agora comparado ao anterior?',
]
const AJUDA = [
  'Como faço uma venda no PDV?',
  'Escrever uma mensagem para o cliente',
  'Criar um post para o Instagram',
]

function telaLabel(path: string): string {
  const seg = path.split('/').filter(Boolean)
  if (seg[0] === 'zapintel') return seg[1] === 'leads' && seg[2] ? `ZapIntel — ficha do lead ${seg[2].replace('lead-', '')}` : `ZapIntel ${seg[1] ?? 'dashboard'}`
  const map: Record<string, string> = {
    dashboard: 'Dashboard', pdv: 'PDV', historico: 'Histórico', estoque: 'Estoque',
    catalogo: 'Produtos', orcamentos: 'Orçamentos', leads: 'Leads', clientes: 'Clientes',
    assistencia: 'Assistência', compras: 'Compras', financeiro: 'Financeiro', relatorios: 'Relatórios',
  }
  return map[seg[0] ?? 'dashboard'] ?? seg[0]
}

// ── Markdown leve (negrito, links, títulos, listas, tabelas) — sem dependência ──

/** `lead:123` vira o endereço do lead na área em que o chat está. */
function destino(href: string, variante: Variante): string | null {
  const lead = href.match(/^lead:(\d+)$/)
  if (lead) return variante === 'zapintel' ? `/zapintel/leads/lead-${lead[1]}` : `/leads?lead=${lead[1]}`
  // Só links internos: o assistente não manda ninguém para fora do sistema.
  return href.startsWith('/') && !href.startsWith('//') ? href : null
}

function inline(s: string, k: string, variante: Variante, aoNavegar: () => void): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={`${k}-${i}`} className="font-semibold">{p.slice(2, -2)}</strong>
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const href = destino(link[2], variante)
      return href
        ? <Link key={`${k}-${i}`} href={href} onClick={aoNavegar} className={cn('font-semibold underline underline-offset-2', variante === 'zapintel' ? 'text-[#6d28d9]' : 'text-accent')}>{link[1]}</Link>
        : <span key={`${k}-${i}`}>{link[1]}</span>
    }
    return <span key={`${k}-${i}`}>{p}</span>
  })
}

function Markdown({ text, variante, aoNavegar }: { text: string; variante: Variante; aoNavegar: () => void }) {
  const blocks: ReactNode[] = []
  let lista: { ord: boolean; itens: string[] } | null = null
  let tabela: string[][] | null = null
  const il = (s: string, k: string) => inline(s, k, variante, aoNavegar)
  const flush = () => {
    if (lista) {
      const items = lista.itens.map((it, i) => <li key={i}>{il(it, `li${blocks.length}-${i}`)}</li>)
      blocks.push(lista.ord
        ? <ol key={`b${blocks.length}`} className="list-decimal space-y-0.5 pl-5">{items}</ol>
        : <ul key={`b${blocks.length}`} className="list-disc space-y-0.5 pl-5">{items}</ul>)
      lista = null
    }
    if (tabela) {
      const [cab, ...linhas] = tabela
      blocks.push(
        <div key={`b${blocks.length}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px] tabular-nums">
            <thead><tr>{cab.map((c, i) => <th key={i} className="border-b border-line px-1.5 py-1 text-left font-semibold">{il(c, `th${i}`)}</th>)}</tr></thead>
            <tbody>{linhas.map((l, r) => <tr key={r}>{l.map((c, i) => <td key={i} className="border-b border-line-soft px-1.5 py-1 align-top">{il(c, `td${r}-${i}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>)
      tabela = null
    }
  }
  text.split('\n').forEach((ln) => {
    if (/^\s*\|.*\|\s*$/.test(ln)) {
      if (lista) flush()
      if (/^\s*\|[\s:|-]+\|\s*$/.test(ln)) return // a linha de separação |---|
      const celulas = ln.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      if (!tabela) tabela = []
      tabela.push(celulas)
      return
    }
    if (tabela) flush()
    const titulo = ln.match(/^\s*#{1,4}\s+(.*)/)
    const num = ln.match(/^\s*\d+[.)]\s+(.*)/)
    const bul = ln.match(/^\s*[-*•]\s+(.*)/)
    if (titulo) { flush(); blocks.push(<p key={`b${blocks.length}`} className="pt-1 font-semibold text-ink">{il(titulo[1], `h${blocks.length}`)}</p>) }
    else if (num) { if (!lista?.ord) { flush(); lista = { ord: true, itens: [] } } lista.itens.push(num[1]) }
    else if (bul) { if (!lista || lista.ord) { flush(); lista = { ord: false, itens: [] } } lista.itens.push(bul[1]) }
    else { flush(); if (ln.trim()) blocks.push(<p key={`b${blocks.length}`}>{il(ln, `p${blocks.length}`)}</p>) }
  })
  flush()
  return <div className="space-y-1.5">{blocks}</div>
}

export function AssistenteWidget({ variante = 'crm' }: { variante?: Variante }) {
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  /** O que o assistente está consultando agora ("Consultando vendas"). */
  const [consultando, setConsultando] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<number | null>(null)
  const [pendentes, setPendentes] = useState(0)
  const [aberturas, setAberturas] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const zi = variante === 'zapintel'
  const cheio = zi ? 'bg-[#7c5cfc]' : 'bg-accent'
  const borda = zi ? 'hover:border-[#7c5cfc] hover:text-[#6d28d9]' : 'hover:border-accent hover:text-accent'

  // Restaura histórico do dispositivo.
  useEffect(() => {
    try { const s = localStorage.getItem(STORE_KEY); if (s) setMsgs(JSON.parse(s)) } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-30))) } catch { /* ignore */ }
  }, [msgs])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading, consultando])

  function alternar() {
    if (!aberto) setAberturas((n) => n + 1)
    setAberto(!aberto)
  }
  function limpar() { setMsgs([]); try { localStorage.removeItem(STORE_KEY) } catch { /* ignore */ } }
  async function copiar(i: number, texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(i); setTimeout(() => setCopiado(null), 1500) } catch { /* ignore */ }
  }
  // Abrir um lead pelo link: no celular o chat cobre a tela, então fecha.
  const aoNavegar = () => { if (window.innerWidth < 640) setAberto(false) }

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
    setConsultando(null)
    const escrever = (txt: string) =>
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: 'model', text: txt }; return c })
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
      setMsgs((m) => [...m, { role: 'model', text: '' }])
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      // Dois formatos: eventos (o assistente que lê o sistema) ou texto puro
      // (o de ajuda de uso, quando não há chave da Anthropic).
      const eventos = (res.headers.get('content-type') ?? '').includes('ndjson')
      let acc = '', buf = '', erro = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const pedaco = dec.decode(value, { stream: true })
        if (!eventos) { acc += pedaco; escrever(acc); continue }
        buf += pedaco
        const linhas = buf.split('\n')
        buf = linhas.pop() ?? ''
        for (const l of linhas) {
          if (!l.trim()) continue
          try {
            const ev = JSON.parse(l) as { t: string; v: string }
            if (ev.t === 'txt') { acc += ev.v; setConsultando(null); escrever(acc) }
            else if (ev.t === 'tool') { setConsultando(ev.v); if (acc && !acc.endsWith('\n')) { acc += '\n\n'; escrever(acc) } }
            else if (ev.t === 'erro') erro = ev.v
          } catch { /* linha parcial */ }
        }
      }
      if (erro) escrever(acc.trim() ? `${acc}\n\n⚠️ ${erro}` : erro)
      else if (!acc.trim()) escrever('Sem resposta. Tente reformular.')
    } catch {
      setMsgs((m) => [...m, { role: 'model', text: 'Falha de conexão. Tente de novo.' }])
    } finally {
      setLoading(false)
      setConsultando(null)
    }
  }

  const streaming = loading && msgs[msgs.length - 1]?.role === 'model' && !!msgs[msgs.length - 1]?.text

  return (
    <>
      <button
        onClick={alternar}
        aria-label={zi && pendentes ? `Assistente — ${pendentes} leads com nova análise disponível` : 'Assistente'}
        title={zi && pendentes ? `${pendentes} leads com conversa nova desde a última análise` : 'Assistente'}
        data-print-hide
        className={cn('fixed bottom-5 right-5 z-40 grid place-items-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95', cheio)}
        style={{ width: 52, height: 52 }}
      >
        {aberto ? <X size={22} strokeWidth={2} /> : <Bot size={24} strokeWidth={2} />}
        {!aberto && zi && pendentes > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[22px] min-w-[22px] place-items-center rounded-full border-2 border-white bg-[#ea580c] px-1.5 text-[11px] font-extrabold tabular-nums">
            {pendentes > 99 ? '99+' : pendentes}
          </span>
        )}
      </button>

      {/* No ZapIntel o bloco das análises existe mesmo fechado: é ele que
          alimenta o número do robô. Escondido, não ocupa nada. */}
      {zi && (
        <div
          className={cn('fixed bottom-[84px] right-5 z-40 flex w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-card border border-line bg-card shadow-xl', !aberto && 'hidden')}
          style={{ height: 'min(600px, calc(100dvh - 120px))' }}
        >
          <Cabecalho zi onLimpar={msgs.length ? limpar : undefined} onFechar={() => setAberto(false)} />
          <AnalisesPendentes onTotal={setPendentes} onAbrirLead={aoNavegar} recontar={aberturas} />
          {corpo()}
        </div>
      )}
      {!zi && aberto && (
        <div className="fixed bottom-[84px] right-5 z-40 flex w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-card border border-line bg-card shadow-xl" style={{ height: 'min(600px, calc(100dvh - 120px))' }}>
          <Cabecalho onLimpar={msgs.length ? limpar : undefined} onFechar={() => setAberto(false)} />
          {corpo()}
        </div>
      )}
    </>
  )

  // Função, não componente: declarada como `<Corpo />` dentro do render, cada
  // letra digitada recriaria o componente e o campo perderia o foco.
  function corpo() {
    return (
      <>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 scrollbar-thin">
          {msgs.length === 0 && (
            <div className="space-y-4">
              <p className="text-[12.5px] text-ink-2">
                Pergunte sobre <strong className="text-ink">vendas, leads e conversas</strong> — eu consulto o sistema e respondo aqui.
                Também ajudo a usar o CRM e a escrever mensagens.
              </p>
              {!zi && (
                <button onClick={iniciarDia} className={cn('flex w-full items-center justify-center gap-2 rounded-control px-3 py-2.5 text-[13px] font-semibold text-white transition-transform hover:scale-[1.01] active:scale-95', cheio)}>
                  ☀️ Iniciar o dia — meu roteiro
                </button>
              )}
              <div>
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Perguntas sobre a loja</div>
                <div className="flex flex-col gap-1.5">
                  {PERGUNTAS.map((s) => (
                    <button key={s} onClick={() => enviar(s)} className={cn('rounded-control border border-line px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors', borda)}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Ajuda e textos</div>
                <div className="flex flex-col gap-1.5">
                  {AJUDA.map((s) => (
                    <button key={s} onClick={() => enviar(s)} className={cn('rounded-control border border-line px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors', borda)}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn('group flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
              {(m.role === 'user' || m.text) && (
                <div className={cn('max-w-[90%] rounded-card px-3 py-2 text-[12.5px] leading-relaxed',
                  m.role === 'user' ? cn('whitespace-pre-wrap text-white', cheio) : 'bg-raised text-ink')}>
                  {m.role === 'user' ? m.text : <Markdown text={m.text} variante={variante} aoNavegar={aoNavegar} />}
                </div>
              )}
              {m.role === 'model' && m.text && !(loading && i === msgs.length - 1) && (
                <button onClick={() => copiar(i, m.text)} className="mt-1 flex items-center gap-1 text-[10.5px] text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100">
                  {copiado === i ? <><Check size={11} /> copiado</> : <><Copy size={11} /> copiar</>}
                </button>
              )}
            </div>
          ))}
          {loading && consultando && (
            <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
              <Search size={12} className="animate-pulse" /> {consultando}…
            </div>
          )}
          {loading && !streaming && !consultando && (
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
            placeholder="Pergunte ou peça um relatório…"
            className={cn('h-10 min-w-0 flex-1 rounded-control border border-line bg-card px-3 text-base text-ink outline-none sm:h-9 sm:text-[12.5px]', zi ? 'focus:border-[#7c5cfc]' : 'focus:border-accent')}
          />
          <button type="submit" disabled={!input.trim() || loading} className={cn('grid size-9 flex-none place-items-center rounded-control text-white disabled:opacity-40', cheio)} aria-label="Enviar">
            <Send size={16} strokeWidth={1.9} />
          </button>
        </form>
      </>
    )
  }
}

function Cabecalho({ zi = false, onLimpar, onFechar }: { zi?: boolean; onLimpar?: () => void; onFechar: () => void }) {
  return (
    <header className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
      <span className={cn('grid size-8 place-items-center rounded-full', zi ? 'bg-[#f1edff] text-[#6d28d9]' : 'bg-accent-soft text-accent')}>
        <Bot size={17} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">Assistente Nexus</div>
        <div className="text-[11px] text-ink-3">Relatórios, análises e ajuda — consulta o sistema</div>
      </div>
      {onLimpar && (
        <button onClick={onLimpar} className="text-ink-3 hover:text-bad" aria-label="Limpar conversa" title="Limpar conversa"><Trash2 size={16} strokeWidth={1.8} /></button>
      )}
      <button onClick={onFechar} className="text-ink-3 hover:text-ink" aria-label="Fechar"><X size={18} strokeWidth={1.8} /></button>
    </header>
  )
}
