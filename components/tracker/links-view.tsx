'use client'

import { useEffect, useState } from 'react'
import { Plus, Copy, Check, Trash2, Link2, MousePointerClick, Globe, MessageSquare, X, ArrowRight, ArrowLeft } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

interface LinkRow { id: number; slug: string; titulo: string | null; destino_url: string; utm_campaign: string | null; ativo: boolean; visitas: number }
type Tipo = 'pagina' | 'whatsapp'

export function LinksView({ appUrl }: { appUrl: string }) {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<'links' | 'desempenho'>('links')
  const [copied, setCopied] = useState<number | null>(null)

  // Drawer
  const [drawer, setDrawer] = useState(false)
  const [passo, setPasso] = useState(1)
  const [tipo, setTipo] = useState<Tipo>('pagina')
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ titulo: '', campanha: '', fonte: '', destino_url: '', numero: '', texto: '' })

  async function carregar() {
    setLoading(true)
    try {
      const r = await fetch('/api/rastreamento/links')
      if (r.status === 403) { setErro('Apenas o dono ou administrador da empresa pode gerenciar campanhas de link.'); setLinks([]); return }
      const d = await r.json(); setLinks(d.links ?? []); setErro(null)
    } catch { setErro('Falha ao carregar.') } finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  function abrirDrawer() { setForm({ titulo: '', campanha: '', fonte: '', destino_url: '', numero: '', texto: '' }); setTipo('pagina'); setPasso(1); setDrawer(true) }

  async function criar() {
    if (!form.titulo.trim()) return
    setSalvando(true)
    try {
      const body = tipo === 'pagina'
        ? { titulo: form.titulo, destino_url: form.destino_url, utm_campaign: form.campanha, utm_source: form.fonte }
        : { titulo: form.titulo, wa_numero: form.numero, wa_texto: form.texto, utm_campaign: form.campanha, utm_source: form.fonte }
      const r = await fetch('/api/rastreamento/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) { setDrawer(false); carregar() }
    } finally { setSalvando(false) }
  }
  async function remover(id: number) { if (!confirm('Excluir?')) return; const r = await fetch(`/api/rastreamento/links/${id}`, { method: 'DELETE' }); if (r.ok) setLinks((ls) => ls.filter((l) => l.id !== id)) }
  const url = (l: LinkRow) => `${appUrl}/i/${l.id}`
  function copy(l: LinkRow) { navigator.clipboard.writeText(url(l)).then(() => { setCopied(l.id); setTimeout(() => setCopied(null), 1500) }) }

  return (
    <div className="px-5 py-5 sm:px-7">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><Link2 size={18} strokeWidth={1.9} /></span>
          <div><h1 className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Links</h1><p className="text-[12.5px]" style={{ color: C.ink3 }}>Campanhas de rastreamento para sua LP ou WhatsApp — alinhado às políticas da Meta.</p></div>
        </div>
        {!erro && <button onClick={abrirDrawer} className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}><Plus size={16} strokeWidth={2} /> Criar campanha</button>}
      </header>

      {erro ? <div className="rounded-[14px] border px-4 py-6 text-center text-[13px]" style={{ borderColor: C.line, background: C.card, color: C.ink3 }}>{erro}</div> : (
        <>
          <div className="mb-4 inline-flex gap-0.5 rounded-[10px] p-0.5" style={{ background: '#e7efec' }}>
            {(['links', 'desempenho'] as const).map((v) => <button key={v} onClick={() => setAba(v)} className="rounded-[8px] px-4 py-1.5 text-[13px] font-semibold transition-colors" style={aba === v ? { background: C.card, color: C.tealDark } : { color: C.ink2 }}>{v === 'links' ? 'Meus links' : 'Desempenho'}</button>)}
          </div>

          {loading ? <div className="h-28 animate-pulse rounded-[14px]" style={{ background: 'rgba(0,0,0,0.04)' }} /> : links.length === 0 ? (
            <div className="grid min-h-[200px] place-items-center rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
              <div className="flex flex-col items-center gap-2 text-center" style={{ color: C.ink3 }}><Link2 size={30} strokeWidth={1.5} /><span className="text-[14px] font-semibold" style={{ color: C.ink }}>Você ainda não tem campanhas</span><span className="max-w-xs text-[12.5px]">Crie uma campanha para rastrear visitas na sua LP (script + UTMs) ou conversas no WhatsApp (wa.me direto).</span><button onClick={abrirDrawer} className="mt-1 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}>+ Criar campanha</button></div>
            </div>
          ) : aba === 'desempenho' ? (
            <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
              <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: C.ink3 }}><th className="px-4 py-2.5 font-semibold">Campanha</th><th className="px-4 py-2.5 font-semibold">Origem</th><th className="px-4 py-2.5 text-right font-semibold">Visitas</th></tr></thead>
                <tbody>{links.map((l) => <tr key={l.id} style={{ borderTop: `1px solid ${C.line}` }}><td className="px-4 py-2.5 font-medium" style={{ color: C.ink }}>{l.titulo || l.slug}</td><td className="px-4 py-2.5" style={{ color: C.ink2 }}>{l.utm_campaign || '—'}</td><td className="px-4 py-2.5 text-right font-semibold" style={{ color: C.ink }}>{l.visitas}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-3" style={{ borderColor: C.line, background: C.card }}>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-[13.5px] font-semibold" style={{ color: C.ink }}>{l.titulo || l.slug}</span>{l.utm_campaign && <span className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: 'rgba(0,168,132,0.10)', color: C.tealDark }}>{l.utm_campaign}</span>}</div><div className="truncate text-[12px]" style={{ color: C.ink3 }}>{url(l)}</div></div>
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: C.ink2 }}><MousePointerClick size={14} style={{ color: C.ink3 }} /> {l.visitas}</span>
                  <button onClick={() => copy(l)} className="inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[12px] font-semibold" style={{ borderColor: C.line, color: C.ink2 }}>{copied === l.id ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</button>
                  <button onClick={() => remover(l.id)} aria-label="Excluir" className="grid h-8 w-8 place-items-center rounded-full" style={{ color: C.ink3 }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Drawer criar campanha */}
      {drawer && (
        <div className="fixed inset-0 z-[70]" onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) setDrawer(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l" style={{ background: C.card, borderColor: C.line }}>
            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: C.line }}><h2 className="text-[16px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Criar campanha</h2><button onClick={() => setDrawer(false)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.ink3 }}><X size={18} /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {passo === 1 ? (
                <>
                  <p className="mb-3 text-[13px] font-semibold" style={{ color: C.ink }}>O que você quer rastrear?</p>
                  <button onClick={() => setTipo('pagina')} className="mb-2 flex w-full items-start gap-3 rounded-[12px] border p-4 text-left" style={{ borderColor: tipo === 'pagina' ? C.teal : C.line, boxShadow: tipo === 'pagina' ? '0 0 0 1px #00a884' : 'none' }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><Globe size={17} /></span>
                    <span><span className="block text-[13.5px] font-semibold" style={{ color: C.ink }}>Minha página (site/LP)</span><span className="block text-[12px]" style={{ color: C.ink3 }}>Instale o script na LP e use parâmetros UTM no Gerenciador — sem encurtador.</span></span>
                  </button>
                  <button onClick={() => setTipo('whatsapp')} className="flex w-full items-start gap-3 rounded-[12px] border p-4 text-left" style={{ borderColor: tipo === 'whatsapp' ? C.teal : C.line, boxShadow: tipo === 'whatsapp' ? '0 0 0 1px #00a884' : 'none' }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><MessageSquare size={17} /></span>
                    <span><span className="block text-[13.5px] font-semibold" style={{ color: C.ink }}>Meu WhatsApp</span><span className="block text-[12px]" style={{ color: C.ink3 }}>Link wa.me direto com código de campanha — para bio, botão na LP ou CTAs orgânicos.</span></span>
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Nome da campanha</span><input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="tk-lk" placeholder="Ex.: Black Friday IG" /></label>
                  {tipo === 'pagina' ? (
                    <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>URL da landing page</span><input value={form.destino_url} onChange={(e) => setForm({ ...form, destino_url: e.target.value })} className="tk-lk" placeholder="https://sualp.com.br/oferta" /></label>
                  ) : (
                    <>
                      <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Número do WhatsApp</span><input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="tk-lk" placeholder="55 14 99999-9999" /></label>
                      <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Mensagem pré-preenchida</span><input value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} className="tk-lk" placeholder="Olá! Vim pelo anúncio..." /></label>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Campanha</span><input value={form.campanha} onChange={(e) => setForm({ ...form, campanha: e.target.value })} className="tk-lk" placeholder="black-friday" /></label>
                    <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Fonte</span><input value={form.fonte} onChange={(e) => setForm({ ...form, fonte: e.target.value })} className="tk-lk" placeholder="instagram" /></label>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t px-5 py-3.5" style={{ borderColor: C.line }}>
              {passo === 2 ? <button onClick={() => setPasso(1)} className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: C.ink2 }}><ArrowLeft size={15} /> Voltar</button> : <button onClick={() => setDrawer(false)} className="text-[13px] font-semibold" style={{ color: C.ink2 }}>Fechar</button>}
              {passo === 1 ? <button onClick={() => setPasso(2)} className="inline-flex items-center gap-1 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}>Continuar <ArrowRight size={15} /></button> : <button onClick={criar} disabled={salvando || !form.titulo.trim()} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Criar campanha</button>}
            </div>
          </div>
        </div>
      )}
      <style>{`.tk-lk{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13.5px;color:${C.ink};background:#fff;outline:none}.tk-lk:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}
