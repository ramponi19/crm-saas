'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Plus, Archive, RotateCcw } from 'lucide-react'
import { Card, Button, IconButton, Input, Select, Badge, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { CAMPOS_QUALIFICACAO } from '@/components/modules/leads/types'

export interface EtapaEdit {
  id?: number
  slug?: string
  label: string
  cor: string
  tipo: string
  ativo: boolean
  ordem?: number
  probabilidade?: number
  camposObrigatorios?: string[]
}

const TIPOS = [
  { v: 'normal', label: 'Normal' },
  { v: 'negociacao', label: 'Negociação' },
  { v: 'ganho', label: 'Ganho' },
  { v: 'perdido', label: 'Perdido' },
]

interface Funil { id: number; nome: string; padrao: boolean }

export function FunilView({ initial, funilId, funis = [] }: { initial: EtapaEdit[]; funilId?: number; funis?: Funil[] }) {
  const router = useRouter()
  const [etapas, setEtapas] = useState<EtapaEdit[]>(initial.length ? initial : [])
  const [saving, setSaving] = useState(false)

  const set = (i: number, patch: Partial<EtapaEdit>) => setEtapas((e) => e.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const move = (i: number, dir: -1 | 1) => setEtapas((e) => {
    const j = i + dir
    if (j < 0 || j >= e.length) return e
    const copy = [...e];[copy[i], copy[j]] = [copy[j], copy[i]]; return copy
  })
  const add = () => setEtapas((e) => [...e, { label: 'Nova etapa', cor: '#9199A3', tipo: 'normal', ativo: true, probabilidade: 25 }])

  async function salvar() {
    if (etapas.some((e) => !e.label.trim())) { notify.warn('Toda etapa precisa de um nome'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/funil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funilId, etapas: etapas.map((e) => ({ id: e.id, label: e.label.trim(), cor: e.cor, tipo: e.tipo, ativo: e.ativo, probabilidade: e.probabilidade ?? 0, camposObrigatorios: e.camposObrigatorios ?? [] })) }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok('Funil salvo', 'O kanban de Leads já reflete as etapas.')
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[760px] space-y-4">
        {funis.length > 1 && (
          <div className="flex w-max items-center gap-0.5 rounded-control border border-line bg-card p-0.5">
            {funis.map(f => {
              const ativo = f.id === funilId
              return (
                <button
                  key={f.id}
                  onClick={() => router.push(`/funil?funil=${f.id}`)}
                  className={cn('whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors', ativo ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink/[0.04]')}
                >
                  {f.nome}
                </button>
              )
            })}
          </div>
        )}
        <p className="text-[13px] text-ink-2">
          As etapas do <b className="text-ink">kanban de Leads</b>. Reordene, renomeie, recolora ou arquive.
          Etapas <b className="text-ink">Ganho</b> e <b className="text-ink">Perdido</b> definem conversão e perda.
        </p>

        <Card flush>
          {etapas.map((e, i) => (
            <div key={e.id ?? `novo-${i}`} className={cn('border-b border-line-soft px-4 py-3 last:border-0', !e.ativo && 'opacity-55')}>
             <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-ink-3 hover:text-ink disabled:opacity-30"><ChevronUp size={15} strokeWidth={1.7} /></button>
                <button onClick={() => move(i, 1)} disabled={i === etapas.length - 1} className="text-ink-3 hover:text-ink disabled:opacity-30"><ChevronDown size={15} strokeWidth={1.7} /></button>
              </div>
              <input type="color" value={e.cor} onChange={(ev) => set(i, { cor: ev.target.value })} className="h-8 w-8 flex-none cursor-pointer rounded-control border border-line bg-transparent p-0.5" aria-label="Cor" />
              <Input wrapperClassName="flex-1" value={e.label} onChange={(ev) => set(i, { label: ev.target.value })} />
              <Select wrapperClassName="w-[140px]" value={e.tipo} onChange={(ev) => set(i, { tipo: ev.target.value })}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </Select>
              <div className="flex w-[92px] flex-none items-center gap-1">
                <Input
                  type="number" min={0} max={100}
                  value={e.probabilidade ?? 0}
                  onChange={(ev) => set(i, { probabilidade: Math.max(0, Math.min(100, Number(ev.target.value))) })}
                  className="num text-center"
                  aria-label="Probabilidade"
                />
                <span className="text-[12px] text-ink-3">%</span>
              </div>
              {!e.ativo && <Badge tone="neutro">Arquivada</Badge>}
              <IconButton aria-label={e.ativo ? 'Arquivar' : 'Reativar'} variant={e.ativo ? 'ghost' : 'outline'} onClick={() => set(i, { ativo: !e.ativo })}>
                {e.ativo ? <Archive size={15} strokeWidth={1.7} /> : <RotateCcw size={15} strokeWidth={1.7} />}
              </IconButton>
             </div>
             {/* Qualificação: campos obrigatórios p/ entrar nesta etapa (Fase 4.6) */}
             <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[52px]">
               <span className="text-[11px] text-ink-3">Exigir p/ entrar:</span>
               {CAMPOS_QUALIFICACAO.map(c => {
                 const on = (e.camposObrigatorios ?? []).includes(c.key)
                 return (
                   <button
                     key={c.key}
                     type="button"
                     onClick={() => set(i, { camposObrigatorios: on ? (e.camposObrigatorios ?? []).filter(x => x !== c.key) : [...(e.camposObrigatorios ?? []), c.key] })}
                     className={cn('rounded-[6px] border px-2 py-0.5 text-[11.5px] font-medium transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink-3 hover:text-ink')}
                   >
                     {c.label}
                   </button>
                 )
               })}
             </div>
            </div>
          ))}
          <div className="px-4 py-3">
            <Button variant="ghost" size="sm" icon={<Plus size={15} strokeWidth={1.7} />} onClick={add}>Adicionar etapa</Button>
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <Button onClick={salvar} loading={saving}>Salvar funil</Button>
          <span className="text-[11.5px] text-ink-3">Etapas existentes mantêm o vínculo com os leads; arquivar não apaga leads.</span>
        </div>
      </div>
    </main>
  )
}
