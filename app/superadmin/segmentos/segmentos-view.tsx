'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil } from 'lucide-react'
import { Card, Button, IconButton, Input, Textarea, Modal, Badge, notify } from '@/components/ui'
import { CATALOGO } from '@/lib/menu'

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
const extrasToLinhas = (e: ModExtra[]) => e.map((x) => `${x.href}|${x.label}|${x.icon}`).join('\n')
const linhasToExtras = (s: string): ModExtra[] =>
  s.split('\n').map((l) => l.split('|').map((p) => p.trim())).filter((p) => p[0]).map((p) => ({ href: p[0], label: p[1] ?? p[0], icon: p[2] ?? 'Home' }))

// Módulos sempre visíveis (núcleo do CRM — não faz sentido esconder por segmento).
const TRAVADOS = new Set(['/dashboard', '/leads', '/clientes'])

interface FormState {
  novo: boolean; chave: string; label: string; descricao: string; ordem: string; ativo: boolean
  funil: string; extra: string
  hidden: string[]                     // hrefs ocultos
  labels: Record<string, string>       // href -> novo nome
}

function fromRow(s: SegmentoRow): FormState {
  return {
    novo: false, chave: s.chave, label: s.label, descricao: s.descricao ?? '', ordem: String(s.ordem), ativo: s.ativo,
    funil: arrToLinhas(arr(s.funil_seed)), extra: extrasToLinhas(extras(s.modulos_extra)),
    hidden: arr(s.hidden_hrefs), labels: obj(s.label_overrides),
  }
}
const EMPTY: FormState = { novo: true, chave: '', label: '', descricao: '', ordem: '99', ativo: true, funil: '', extra: '', hidden: [], labels: {} }

export function SegmentosView({ initial }: { initial: SegmentoRow[] }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof FormState, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const visivel = (href: string) => !form?.hidden.includes(href)
  function toggleVisivel(href: string) {
    if (TRAVADOS.has(href)) return
    setForm((f) => {
      if (!f) return f
      const hidden = f.hidden.includes(href) ? f.hidden.filter((h) => h !== href) : [...f.hidden, href]
      return { ...f, hidden }
    })
  }
  function renomear(href: string, valor: string) {
    setForm((f) => {
      if (!f) return f
      const labels = { ...f.labels }
      if (valor.trim()) labels[href] = valor.trim(); else delete labels[href]
      return { ...f, labels }
    })
  }

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
          funil_seed: linhasToArr(form.funil), hidden_hrefs: form.hidden,
          label_overrides: form.labels, modulos_extra: linhasToExtras(form.extra),
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
          <p className="mt-0.5 text-[13px] text-ink-2">Crie e edite verticais sem deploy — labels, menu, funil e módulos extras.</p>
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
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Label" value={form.label} onChange={(e) => set('label', e.target.value)} />
              <Input label="Chave" value={form.chave} onChange={(e) => set('chave', e.target.value)} disabled={!form.novo} hint={form.novo ? 'gerada do label se vazia' : 'não editável'} />
              <Input wrapperClassName="col-span-2" label="Descrição" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} />
            </div>

            {/* Menu do CRM por caixa de seleção */}
            <div>
              <div className="mb-1 text-[12.5px] font-semibold text-ink">Menu do CRM</div>
              <p className="mb-3 text-[11.5px] text-ink-3">Marque os módulos visíveis neste segmento. Renomeie no campo ao lado (opcional).</p>
              <div className="space-y-4 rounded-card border border-line-soft p-3">
                {CATALOGO.map((grupo) => (
                  <div key={grupo.label}>
                    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{grupo.label}</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {grupo.items.map((it) => {
                        const travado = TRAVADOS.has(it.href)
                        const on = visivel(it.href)
                        return (
                          <div key={it.href} className="flex items-center gap-2">
                            <label className={`flex min-w-0 flex-1 items-center gap-2 rounded-control border px-2.5 py-1.5 text-[12.5px] ${on ? 'border-line bg-card text-ink' : 'border-line-soft bg-bg text-ink-3'} ${travado ? 'opacity-70' : 'cursor-pointer'}`}>
                              <input type="checkbox" checked={on} disabled={travado} onChange={() => toggleVisivel(it.href)} className="h-3.5 w-3.5 accent-[#6D28D9]" />
                              <span className="truncate">{it.label}</span>
                              {travado && <span className="ml-auto text-[9.5px] text-ink-3">fixo</span>}
                            </label>
                            <input
                              value={form.labels[it.href] ?? ''}
                              onChange={(e) => renomear(it.href, e.target.value)}
                              placeholder="renomear"
                              disabled={!on}
                              className="h-8 w-[92px] flex-none rounded-control border border-line bg-card px-2 text-[11.5px] text-ink placeholder:text-ink-3 outline-none focus:border-accent disabled:opacity-40"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Textarea wrapperClassName="col-span-2" label="Funil (uma etapa por linha)" rows={4} value={form.funil} onChange={(e) => set('funil', e.target.value)} placeholder={'Novo\nContato\nFechamento'} />
              <Textarea wrapperClassName="col-span-2" label="Módulos extras (href|Label|Ícone) — avançado" rows={2} value={form.extra} onChange={(e) => set('extra', e.target.value)} placeholder={'/imoveis|Imóveis|Home'} />
              <Input label="Ordem" className="num" value={form.ordem} onChange={(e) => set('ordem', e.target.value.replace(/[^0-9]/g, ''))} />
              <label className="flex items-center gap-2 pt-6 text-[13px] text-ink">
                <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 accent-[#6D28D9]" /> Ativo
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
