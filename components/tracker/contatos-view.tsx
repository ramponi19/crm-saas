'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Download, UserPlus, MessageSquare, Phone, Wallet, GitBranch, Tag, X } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

export interface Contato {
  id: number; nome: string; telefone: string | null; foto_url: string | null
  origem: string | null; etapa: string | null; valor: number | null; produto: string | null; criado: string | null
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const iniciais = (n: string) => n.trim().slice(0, 2).toUpperCase()
const dataBR = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'

export function ContatosView({ contatos: init, etapaLabels }: { contatos: Contato[]; etapaLabels: Record<string, string> }) {
  const [contatos, setContatos] = useState<Contato[]>(init)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<number | null>(init[0]?.id ?? null)
  const [arquivados, setArquivados] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ nome: '', telefone: '' })
  const [salvando, setSalvando] = useState(false)

  const filtrados = useMemo(() => contatos.filter((c) => {
    const q = busca.toLowerCase()
    return !q || c.nome.toLowerCase().includes(q) || (c.telefone ?? '').includes(busca)
  }), [contatos, busca])
  const atual = contatos.find((c) => c.id === sel) ?? null

  async function toggleArquivados(v: boolean) {
    setArquivados(v)
    const r = await fetch(`/api/tracker/contatos${v ? '?arquivados=1' : ''}`)
    const d = await r.json()
    const lista: Contato[] = (d.contatos ?? []).map((l: Record<string, unknown>) => ({
      id: l.id as number, nome: (l.nome as string) || (l.telefone as string) || 'Sem nome', telefone: l.telefone as string | null,
      foto_url: l.foto_url as string | null, origem: l.origem as string | null, etapa: l.kanban_status as string | null,
      valor: l.valor_estimado != null ? Number(l.valor_estimado) : null, produto: l.produto_interessado as string | null, criado: l.created_at as string | null,
    }))
    setContatos(lista); setSel(lista[0]?.id ?? null)
  }

  async function criar() {
    if (!form.nome.trim() && !form.telefone.trim()) return
    setSalvando(true)
    try {
      const r = await fetch('/api/tracker/contatos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (r.ok) {
        const c: Contato = { id: d.contato.id, nome: d.contato.nome || d.contato.telefone || 'Sem nome', telefone: d.contato.telefone, foto_url: null, origem: d.contato.origem, etapa: d.contato.kanban_status, valor: null, produto: null, criado: d.contato.created_at }
        setContatos((l) => [c, ...l]); setSel(c.id); setForm({ nome: '', telefone: '' }); setModal(false)
      }
    } finally { setSalvando(false) }
  }

  function exportar() {
    const linhas = [['Nome', 'Telefone', 'Origem', 'Etapa', 'Valor', 'Criado'], ...filtrados.map((c) => [c.nome, c.telefone ?? '', c.origem ?? '', etapaLabels[c.etapa ?? ''] ?? c.etapa ?? '', c.valor != null ? String(c.valor) : '', dataBR(c.criado)])]
    const csv = linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'contatos.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Lista */}
      <aside className="flex w-full max-w-[360px] shrink-0 flex-col border-r" style={{ borderColor: C.line, background: C.card }}>
        <div className="border-b p-3" style={{ borderColor: C.line }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px]" style={{ color: C.ink3 }}>{filtrados.length} registros</span>
            <div className="flex gap-1.5">
              <button onClick={exportar} className="inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[12px] font-semibold" style={{ borderColor: C.line, color: C.ink2 }}><Download size={13} /> Exportar</button>
              <button onClick={() => setModal(true)} className="inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: C.teal }}><UserPlus size={13} /> Novo</button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: '#f1f4f6' }}>
            <Search size={16} style={{ color: C.ink3 }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato (mín. 2 letras)…" className="w-full bg-transparent text-[13.5px] outline-none" style={{ color: C.ink }} />
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: C.ink2 }}>
            <input type="checkbox" checked={arquivados} onChange={(e) => toggleArquivados(e.target.checked)} className="h-3.5 w-3.5 rounded accent-[#00a884]" /> Mostrar contatos arquivados
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtrados.length === 0 ? <div className="grid place-items-center py-16 text-[13px]" style={{ color: C.ink3 }}>Nenhum contato.</div> : filtrados.map((c) => (
            <button key={c.id} onClick={() => setSel(c.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" style={{ background: c.id === sel ? '#f0faf7' : 'transparent', borderLeft: c.id === sel ? `3px solid ${C.teal}` : '3px solid transparent' }}>
              {c.foto_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.foto_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: C.teal }}>{iniciais(c.nome)}</span>}
              <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-semibold" style={{ color: C.ink }}>{c.nome}</div><div className="truncate text-[12px]" style={{ color: C.ink3 }}>{c.telefone || c.origem || '—'}</div></div>
            </button>
          ))}
        </div>
      </aside>

      {/* Ficha */}
      <section className="min-w-0 flex-1" style={{ background: '#f7f9fa' }}>
        {!atual ? (
          <div className="grid h-full place-items-center"><div className="flex flex-col items-center gap-2" style={{ color: C.ink3 }}><UserPlus size={38} strokeWidth={1.4} /><span className="text-[14px]">Selecione um contato</span></div></div>
        ) : (
          <div className="mx-auto max-w-[560px] px-5 py-8">
            <div className="flex flex-col items-center text-center">
              {atual.foto_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={atual.foto_url} alt="" className="h-20 w-20 rounded-full object-cover" />
                : <span className="grid h-20 w-20 place-items-center rounded-full text-[26px] font-bold text-white" style={{ background: C.teal }}>{iniciais(atual.nome)}</span>}
              <h1 className="mt-3 text-[20px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{atual.nome}</h1>
              {atual.telefone && <div className="inline-flex items-center gap-1 text-[13px]" style={{ color: C.ink3 }}><Phone size={13} />{atual.telefone}</div>}
              <Link href="/tracker/conversas" className="mt-3 inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}><MessageSquare size={15} /> Abrir conversa</Link>
            </div>
            <div className="mt-6 space-y-2 rounded-[14px] border p-5" style={{ borderColor: C.line, background: C.card }}>
              <Linha icon={<GitBranch size={15} />} label="Etapa" valor={etapaLabels[atual.etapa ?? ''] ?? atual.etapa ?? '—'} />
              <Linha icon={<Wallet size={15} />} label="Valor estimado" valor={atual.valor != null && atual.valor > 0 ? brl(atual.valor) : '—'} />
              <Linha icon={<Tag size={15} />} label="Produto" valor={atual.produto || '—'} />
              <Linha icon={<Tag size={15} />} label="Origem" valor={atual.origem || '—'} />
              <Linha icon={<Tag size={15} />} label="Criado em" valor={dataBR(atual.criado)} />
            </div>
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) setModal(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-[420px] rounded-[16px] border p-5" style={{ background: C.card, borderColor: C.line }}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-[16px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Novo contato</h2><button onClick={() => setModal(false)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.ink3 }}><X size={18} /></button></div>
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Nome</span><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="tk-ct" placeholder="Nome do contato" /></label>
              <label className="block"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Telefone</span><input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="tk-ct" placeholder="55 14 99999-9999" /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ color: C.ink2 }}>Cancelar</button><button onClick={criar} disabled={salvando} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Salvar</button></div>
          </div>
        </div>
      )}
      <style>{`.tk-ct{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13.5px;color:${C.ink};background:#fff;outline:none}.tk-ct:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}

function Linha({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: C.ink3 }}>{icon}{label}</span>
      <span className="truncate text-[13px] font-semibold" style={{ color: C.ink }}>{valor}</span>
    </div>
  )
}
