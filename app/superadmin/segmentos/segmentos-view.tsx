'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil } from 'lucide-react'
import { Card, Button, IconButton, Input, Textarea, Modal, Badge, notify } from '@/components/ui'

export interface SegmentoRow {
  chave: string
  label: string
  descricao: string | null
  hidden_hrefs: unknown
  label_overrides: unknown
  funil_seed: unknown
  modulos_extra: unknown
  ordem: number
  ativo: boolean
}

type ModExtra = { href: string; label: string; icon: string }

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const obj = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {})
const extras = (v: unknown): ModExtra[] => (Array.isArray(v) ? (v as ModExtra[]) : [])

const linhasToArr = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const arrToLinhas = (a: string[]) => a.join('\n')
const mapToLinhas = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join('\n')
const linhasToMap = (s: string) => {
  const m: Record<string, string> = {}
  for (const l of s.split('\n')) { const i = l.indexOf('='); if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim() }
  return m
}
const extrasToLinhas = (e: ModExtra[]) => e.map((x) => `${x.href}|${x.label}|${x.icon}`).join('\n')
const linhasToExtras = (s: string): ModExtra[] =>
  s.split('\n').map((l) => l.split('|').map((p) => p.trim())).filter((p) => p[0]).map((p) => ({ href: p[0], label: p[1] ?? p[0], icon: p[2] ?? 'Home' }))

interface FormState {
  novo: boolean; chave: string; label: string; descricao: string; ordem: string; ativo: boolean
  funil: string; hidden: string; labels: string; extra: string
}

function fromRow(s: SegmentoRow): FormState {
  return {
    novo: false, chave: s.chave, label: s.label, descricao: s.descricao ?? '', ordem: String(s.ordem), ativo: s.ativo,
    funil: arrToLinhas(arr(s.funil_seed)), hidden: arrToLinhas(arr(s.hidden_hrefs)),
    labels: mapToLinhas(obj(s.label_overrides)), extra: extrasToLinhas(extras(s.modulos_extra)),
  }
}
const EMPTY: FormState = { novo: true, chave: '', label: '', descricao: '', ordem: '99', ativo: true, funil: '', hidden: '', labels: '', extra: '' }

export function SegmentosView({ initial }: { initial: SegmentoRow[] }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof FormState, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f))

  async function salvar() {
    if (!form) return
    if (!form.label.trim()) { notify.warn('Informe o label'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/segmentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novo: form.novo, chave: form.chave, label: form.label, descricao: form.descricao,
          ordem: Number(form.ordem) || 0, ativo: form.ativo,
          funil_seed: linhasToArr(form.funil), hidden_hrefs: linhasToArr(form.hidden),
          label_overrides: linhasToMap(form.labels), modulos_extra: linhasToExtras(form.extra),
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok('Segmento salvo')
      setForm(null)
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-8 py-7">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.03em] text-ink">Segmentos</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Crie e edite verticais sem deploy — labels, menu oculto, funil e módulos extras.</p>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.7} />} className="!bg-[#6D28D9] hover:!bg-[#6D28D9]/90" onClick={() => setForm(EMPTY)}>Novo segmento</Button>
      </div>

      <Card flush>
        <div className="divide-y divide-line-soft">
          {initial.map((s) => (
            <div key={s.chave} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">{s.label}</span>
                  <span className="num text-[11px] text-ink-3">{s.chave}</span>
                  {!s.ativo && <Badge tone="neutro">inativo</Badge>}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">{arr(s.funil_seed).length} etapas · {arr(s.hidden_hrefs).length} ocultos · {extras(s.modulos_extra).length} módulos extras</div>
              </div>
              <IconButton aria-label="Editar" onClick={() => setForm(fromRow(s))}><Pencil size={15} strokeWidth={1.7} /></IconButton>
            </div>
          ))}
        </div>
      </Card>

      {form && (
        <Modal
          open
          onClose={() => setForm(null)}
          size="lg"
          title={form.novo ? 'Novo segmento' : `Editar · ${form.label}`}
          footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button className="!bg-[#6D28D9] hover:!bg-[#6D28D9]/90" onClick={salvar} loading={saving}>Salvar</Button></>}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input label="Label" value={form.label} onChange={(e) => set('label', e.target.value)} />
            <Input label="Chave" value={form.chave} onChange={(e) => set('chave', e.target.value)} disabled={!form.novo} hint={form.novo ? 'gerada do label se vazia' : 'não editável'} />
            <Input wrapperClassName="col-span-2" label="Descrição" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} />
            <Textarea wrapperClassName="col-span-2" label="Funil (uma etapa por linha)" rows={4} value={form.funil} onChange={(e) => set('funil', e.target.value)} placeholder={'Novo\nContato\nFechamento'} />
            <Textarea label="Menu oculto (um href por linha)" rows={4} value={form.hidden} onChange={(e) => set('hidden', e.target.value)} placeholder={'/pdv\n/estoque'} />
            <Textarea label="Renomear (href=Novo nome)" rows={4} value={form.labels} onChange={(e) => set('labels', e.target.value)} placeholder={'/clientes=Pacientes'} />
            <Textarea wrapperClassName="col-span-2" label="Módulos extras (href|Label|Icone)" rows={3} value={form.extra} onChange={(e) => set('extra', e.target.value)} placeholder={'/imoveis|Imóveis|Home'} />
            <Input label="Ordem" className="num" value={form.ordem} onChange={(e) => set('ordem', e.target.value.replace(/[^0-9]/g, ''))} />
            <label className="flex items-center gap-2 pt-6 text-[13px] text-ink">
              <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 accent-[#6D28D9]" /> Ativo
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}
