'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Textarea, Modal, notify } from '@/components/ui'
import { Plus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

export interface Solicitacao {
  id: number
  item: string
  objetivo: string | null
  canais: string[]
  status: string
  solicitante_id: string | null
  created_at: string | null
}

const COLUNAS = [
  { id: 'solicitado', label: 'Solicitado' },
  { id: 'em_analise', label: 'Em análise' },
  { id: 'aprovado', label: 'Aprovado' },
  { id: 'divulgado', label: 'Divulgado' },
]
const ORDEM = COLUNAS.map((c) => c.id)
const CANAIS: { id: string; label: string }[] = [
  { id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' }, { id: 'site', label: 'Site' },
  { id: 'portais', label: 'Portais' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'email', label: 'E-mail' },
]
const CANAL_LABEL = Object.fromEntries(CANAIS.map((c) => [c.id, c.label]))

export function MarketingView({ itensIniciais, meuId }: { itensIniciais: Solicitacao[]; meuId: string }) {
  const [itens, setItens] = useState<Solicitacao[]>(itensIniciais)
  const [novo, setNovo] = useState(false)

  async function mover(s: Solicitacao, dir: -1 | 1) {
    const i = ORDEM.indexOf(s.status)
    const j = i + dir
    if (j < 0 || j >= ORDEM.length) return
    const status = ORDEM[j]
    setItens((prev) => prev.map((x) => x.id === s.id ? { ...x, status } : x))
    const r = await fetch('/api/marketing', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status }) })
    if (!r.ok) { notify.bad('Erro ao mover'); setItens((prev) => prev.map((x) => x.id === s.id ? { ...x, status: s.status } : x)) }
  }

  async function excluir(id: number) {
    setItens((prev) => prev.filter((x) => x.id !== id))
    const r = await fetch(`/api/marketing?id=${id}`, { method: 'DELETE' })
    if (!r.ok) notify.bad('Erro ao excluir')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Marketing" />
      <div className="flex flex-1 flex-col overflow-hidden p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Pipeline de marketing</h1>
            <p className="text-[13px] text-ink-3">Solicite e acompanhe as divulgações do início ao ar.</p>
          </div>
          <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setNovo(true)}>Solicitar marketing</Button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4 lg:overflow-hidden">
          {COLUNAS.map((col) => {
            const cards = itens.filter((s) => s.status === col.id)
            return (
              <div key={col.id} className="flex min-h-0 flex-col rounded-card border border-line bg-card/60">
                <div className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
                  <span className="text-[12.5px] font-semibold text-ink">{col.label}</span>
                  <span className="num rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] text-ink-2">{cards.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin">
                  {cards.length === 0 ? (
                    <div className="py-6 text-center text-[11.5px] text-ink-3">—</div>
                  ) : cards.map((s) => {
                    const i = ORDEM.indexOf(s.status)
                    return (
                      <div key={s.id} className="group rounded-control border border-line bg-card p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-medium text-ink">{s.item}</span>
                          {(s.solicitante_id === meuId) && (
                            <button onClick={() => excluir(s.id)} className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-bad group-hover:opacity-100" aria-label="Excluir"><Trash2 size={13} strokeWidth={1.7} /></button>
                          )}
                        </div>
                        {s.objetivo && <p className="mt-1 text-[11.5px] text-ink-3">{s.objetivo}</p>}
                        {s.canais.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.canais.map((c) => <span key={c} className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">{CANAL_LABEL[c] ?? c}</span>)}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-1.5">
                          <button onClick={() => mover(s, -1)} disabled={i === 0} className="text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Voltar etapa"><ChevronLeft size={15} strokeWidth={1.8} /></button>
                          <button onClick={() => mover(s, 1)} disabled={i === ORDEM.length - 1} className="text-ink-3 hover:text-accent disabled:opacity-30" aria-label="Avançar etapa"><ChevronRight size={15} strokeWidth={1.8} /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {novo && <NovaSolicitacao onClose={() => setNovo(false)} onCreate={(s) => { setItens((prev) => [s, ...prev]); setNovo(false) }} />}
    </div>
  )
}

function NovaSolicitacao({ onClose, onCreate }: { onClose: () => void; onCreate: (s: Solicitacao) => void }) {
  const [item, setItem] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [canais, setCanais] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const toggle = (c: string) => setCanais((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])

  async function salvar() {
    if (!item.trim()) { notify.warn('Descreva o que divulgar'); return }
    setSalvando(true)
    const r = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item, objetivo, canais }) })
    setSalvando(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.solicitacao) { notify.bad('Erro ao solicitar', j.error); return }
    notify.ok('Solicitação criada')
    onCreate(j.solicitacao as Solicitacao)
  }

  return (
    <Modal open onClose={onClose} title="Solicitar marketing" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button onClick={salvar} loading={salvando}>Solicitar</Button>
    </>}>
      <div className="space-y-4">
        <Input label="O que divulgar" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Ex.: Apartamento 3 quartos no Centro / Promoção de inverno" />
        <Textarea label="Objetivo" rows={3} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="O que se espera dessa divulgação…" />
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-2">Canais de divulgação</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CANAIS.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-control border border-line px-3 py-2 text-[13px] text-ink">
                <input type="checkbox" checked={canais.includes(c.id)} onChange={() => toggle(c.id)} className="size-4 accent-accent" />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
