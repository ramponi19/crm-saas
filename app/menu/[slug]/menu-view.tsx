'use client'

import { useState, useMemo } from 'react'
import { Plus, Minus, ShoppingBag, X, CheckCircle2 } from 'lucide-react'

export interface MenuItem { id: number; nome: string; preco: number | null; descricao: string | null; foto_url: string | null; categoria: string }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MenuView({ slug, empresaNome, cor, whatsapp, logo, itens }: {
  slug: string; empresaNome: string; cor: string; whatsapp: string | null; logo: string | null; itens: MenuItem[]
}) {
  const [qtd, setQtd] = useState<Record<number, number>>({})
  const [checkout, setCheckout] = useState(false)
  const [mesa, setMesa] = useState('')
  const [nome, setNome] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [numero, setNumero] = useState<number | null>(null)
  const add = (id: number, d: number) => setQtd((q) => { const n = Math.max(0, (q[id] ?? 0) + d); return { ...q, [id]: n } })

  const grupos = useMemo(() => {
    const m: Record<string, MenuItem[]> = {}
    for (const i of itens) (m[i.categoria] = m[i.categoria] ?? []).push(i)
    return Object.entries(m)
  }, [itens])

  const { total, linhas } = useMemo(() => {
    let total = 0; const linhas: string[] = []
    for (const i of itens) {
      const n = qtd[i.id] ?? 0
      if (n > 0) { const sub = (i.preco ?? 0) * n; total += sub; linhas.push(`${n}x ${i.nome}${i.preco ? ` — ${brl(sub)}` : ''}`) }
    }
    return { total, linhas }
  }, [qtd, itens])

  const temItens = linhas.length > 0

  async function enviarPedido() {
    setEnviando(true)
    const payload = { mesa, cliente_nome: nome, observacoes: obs, itens: itens.filter((i) => (qtd[i.id] ?? 0) > 0).map((i) => ({ produto_id: i.id, qtd: qtd[i.id] })) }
    const r = await fetch(`/api/menu/${slug}/pedido`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setEnviando(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert(j.error || 'Não foi possível enviar o pedido.'); return }
    setNumero(j.numero); setCheckout(false); setQtd({})
  }

  function pedirWhatsapp() {
    const msg = `Olá, ${empresaNome}! Quero fazer um pedido:\n\n${linhas.join('\n')}\n\n*Total: ${brl(total)}*`
    const num = (whatsapp ?? '').replace(/\D/g, '')
    const alvo = num ? (num.length <= 11 ? '55' + num : num) : ''
    window.open(alvo ? `https://wa.me/${alvo}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (numero != null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-[400px] rounded-card border border-line bg-card p-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full" style={{ background: `${cor}1a`, color: cor }}><CheckCircle2 size={30} strokeWidth={1.7} /></div>
          <h2 className="text-[18px] font-semibold text-ink">Pedido enviado!</h2>
          <p className="mt-1 text-[14px] text-ink-2">Seu número é <span className="num font-bold" style={{ color: cor }}>#{numero}</span></p>
          <p className="mt-3 text-[12.5px] text-ink-3">A cozinha já recebeu. Acompanhe o preparo com o atendente.</p>
          <button onClick={() => setNumero(null)} className="mt-5 h-11 w-full rounded-control text-[14px] font-semibold text-white" style={{ background: cor }}>Fazer outro pedido</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg pb-28 text-ink">
      <header className="border-b border-line-soft bg-card px-4 py-5">
        <div className="mx-auto flex max-w-[640px] items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={empresaNome} className="h-10 w-auto object-contain" />
          ) : (
            <span className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: cor }}>{empresaNome}</span>
          )}
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Cardápio</span>
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-4 py-5">
        {itens.length === 0 && <p className="py-10 text-center text-[13px] text-ink-3">Cardápio em preparação.</p>}
        {grupos.map(([cat, lista]) => (
          <section key={cat} className="mb-6">
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em]" style={{ color: cor }}>{cat}</h2>
            <div className="space-y-2">
              {lista.map((i) => {
                const n = qtd[i.id] ?? 0
                return (
                  <div key={i.id} className="flex items-center gap-3 rounded-card border border-line bg-card p-3">
                    {i.foto_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.foto_url} alt={i.nome} className="h-16 w-16 flex-none rounded-control object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-ink">{i.nome}</div>
                      {i.descricao && <div className="line-clamp-2 text-[12px] text-ink-3">{i.descricao}</div>}
                      {i.preco != null && <div className="num mt-0.5 text-[13.5px] font-bold" style={{ color: cor }}>{brl(i.preco)}</div>}
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      {n > 0 && (
                        <>
                          <button onClick={() => add(i.id, -1)} className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink"><Minus size={15} strokeWidth={2} /></button>
                          <span className="num w-4 text-center text-[14px] font-semibold">{n}</span>
                        </>
                      )}
                      <button onClick={() => add(i.id, 1)} className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: cor }}><Plus size={15} strokeWidth={2} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </main>

      {temItens && !checkout && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-card px-4 py-3">
          <div className="mx-auto flex max-w-[640px] items-center gap-3">
            <div className="flex-1">
              <div className="text-[11px] text-ink-3">{linhas.length} {linhas.length === 1 ? 'item' : 'itens'}</div>
              <div className="num text-[17px] font-bold text-ink">{brl(total)}</div>
            </div>
            <button onClick={() => setCheckout(true)} className="flex items-center gap-2 rounded-control px-5 py-3 text-[14px] font-semibold text-white" style={{ background: cor }}>
              <ShoppingBag size={17} strokeWidth={1.9} /> Fazer pedido
            </button>
          </div>
        </div>
      )}

      {checkout && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) setCheckout(false) }}>
          <div className="w-full max-w-[440px] rounded-t-modal bg-card p-5 sm:rounded-modal">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-ink">Finalizar pedido</h2>
              <button onClick={() => setCheckout(false)} className="text-ink-3 hover:text-ink"><X size={18} strokeWidth={1.8} /></button>
            </div>
            <div className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-control border border-line-soft bg-bg p-2.5 text-[12.5px] text-ink-2">
              {linhas.map((l, i) => <div key={i}>{l}</div>)}
              <div className="mt-1 border-t border-line-soft pt-1 text-right font-bold text-ink">Total: {brl(total)}</div>
            </div>
            <div className="space-y-2.5">
              <input value={mesa} onChange={(e) => setMesa(e.target.value)} placeholder="Mesa (ex.: 5)" className="h-11 w-full rounded-control border border-line bg-bg px-3.5 text-[15px] text-ink outline-none focus:border-accent" />
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome (opcional)" className="h-11 w-full rounded-control border border-line bg-bg px-3.5 text-[15px] text-ink outline-none focus:border-accent" />
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações (ex.: sem cebola)" className="h-11 w-full rounded-control border border-line bg-bg px-3.5 text-[15px] text-ink outline-none focus:border-accent" />
              <button onClick={enviarPedido} disabled={enviando} className="h-12 w-full rounded-control text-[15px] font-semibold text-white disabled:opacity-50" style={{ background: cor }}>
                {enviando ? 'Enviando…' : `Enviar pedido · ${brl(total)}`}
              </button>
              <button onClick={pedirWhatsapp} className="h-10 w-full rounded-control border border-line text-[13px] font-medium text-ink-2">Prefiro pedir pelo WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
