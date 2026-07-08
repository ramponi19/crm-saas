'use client'
import { useState } from 'react'
import { Plus, Save, Pencil, Star, Users, Layers, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, Button, IconButton, Input, Badge, Modal, notify } from '@/components/ui'

interface Plano {
  id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  stripe_price_id: string | null
  limite_usuarios: number
  limite_leads: number
  features: string[]
  destaque: boolean
  ativo: boolean
  ordem: number
  cor: string
}

// Roxo da plataforma (superadmin) — único toque de accent permitido aqui.
const PLATFORM = '#6D28D9'

function fmtPreco(centavos: number) {
  if (centavos === 0) return 'Grátis'
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/mês`
}

export default function PlanosAdminView({ planos: initial }: { planos: Plano[] }) {
  const [planos, setPlanos] = useState<Plano[]>(initial)
  const [editing, setEditing] = useState<Plano | null>(null)
  const [saving, setSaving] = useState(false)
  const [newFeature, setNewFeature] = useState('')

  function abrirEdicao(p: Plano) {
    setEditing({ ...p, features: Array.isArray(p.features) ? [...p.features] : [] })
  }

  function setField<K extends keyof Plano>(k: K, v: Plano[K]) {
    setEditing(e => e ? { ...e, [k]: v } : e)
  }

  function addFeature() {
    const f = newFeature.trim()
    if (!f || !editing) return
    setEditing(e => e ? { ...e, features: [...e.features, f] } : e)
    setNewFeature('')
  }

  function removeFeature(i: number) {
    setEditing(e => e ? { ...e, features: e.features.filter((_, idx) => idx !== i) } : e)
  }

  async function salvar() {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/planos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setPlanos(prev => prev.map(p => p.id === editing.id ? json.plano : p))
      setEditing(null)
      notify.ok('Plano salvo!')
    } catch (e) {
      notify.bad(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-line px-8 py-5">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: PLATFORM }}>Super Admin</p>
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Gestão de Planos</h1>
        <p className="mt-0.5 text-[14px] text-ink-2">Edite preços, limites e funcionalidades de cada plano</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-thin">
        {/* Cards dos planos */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          {planos.map(p => (
            <Card
              key={p.id}
              className={cn('relative', p.destaque && 'border-2')}
              style={p.destaque ? { borderColor: PLATFORM } : undefined}
            >
              {p.destaque && (
                <div
                  className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[6px] px-3 py-1 text-[10px] font-bold text-white"
                  style={{ background: PLATFORM }}
                >
                  <Star size={10} strokeWidth={1.7} fill="white" /> DESTAQUE
                </div>
              )}

              <div className="mb-4 flex items-start justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-3 w-3 flex-none rounded-full" style={{ background: p.cor }} />
                    <h3 className="text-[17px] font-bold text-ink">{p.nome}</h3>
                    {!p.ativo && <Badge tone="neutro">Inativo</Badge>}
                  </div>
                  <p className="text-[12px] text-ink-2">{p.descricao}</p>
                </div>
                <Button size="sm" variant="outline" icon={<Pencil size={12} strokeWidth={1.7} />} onClick={() => abrirEdicao(p)}>
                  Editar
                </Button>
              </div>

              <div className="num mb-4 text-[24px] font-bold text-ink">{fmtPreco(p.preco_centavos)}</div>

              <div className="mb-4 flex gap-4 text-[12px] text-ink-2">
                <span className="flex items-center gap-1"><Users size={12} strokeWidth={1.7} /> {p.limite_usuarios === 999 ? 'Ilimitados' : p.limite_usuarios} usuários</span>
                <span className="flex items-center gap-1"><Layers size={12} strokeWidth={1.7} /> {p.limite_leads >= 99999 ? 'Ilimitados' : p.limite_leads} leads</span>
              </div>

              <ul className="space-y-1">
                {(Array.isArray(p.features) ? p.features : []).map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px] text-ink-2">
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-ink/25" />
                    {f}
                  </li>
                ))}
              </ul>

              {p.stripe_price_id && (
                <p className="num mt-3 truncate text-[11px] text-ink-3">Stripe: {p.stripe_price_id}</p>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Modal de edição */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="md"
        disableOverlayClose={saving}
        title={editing ? <span>Editar plano <span className="num ml-1 text-[12px] font-normal text-ink-3">ID: {editing.id}</span></span> : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} loading={saving} icon={<Save size={14} strokeWidth={1.7} />} style={{ background: PLATFORM }} className="text-white hover:opacity-90">
              {saving ? 'Salvando…' : 'Salvar plano'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {/* Nome + Cor */}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nome" value={editing.nome} onChange={e => setField('nome', e.target.value)} />
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-ink-2">Cor (hex)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={editing.cor}
                    onChange={e => setField('cor', e.target.value)}
                    className="h-9 w-11 flex-none cursor-pointer rounded-control border border-line bg-transparent"
                  />
                  <Input wrapperClassName="flex-1" className="num" value={editing.cor} onChange={e => setField('cor', e.target.value)} />
                </div>
              </div>
            </div>

            <Input label="Descrição" value={editing.descricao ?? ''} onChange={e => setField('descricao', e.target.value)} />

            {/* Preço + Stripe */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Preço (centavos)"
                type="number"
                min={0}
                value={editing.preco_centavos}
                onChange={e => setField('preco_centavos', Number(e.target.value))}
                hint={fmtPreco(editing.preco_centavos)}
              />
              <Input
                label="Stripe Price ID"
                className="num"
                value={editing.stripe_price_id ?? ''}
                onChange={e => setField('stripe_price_id', e.target.value || null)}
                placeholder="price_…"
              />
            </div>

            {/* Limites */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Limite de usuários"
                type="number"
                min={1}
                value={editing.limite_usuarios}
                onChange={e => setField('limite_usuarios', Number(e.target.value))}
                hint="999 = ilimitado"
              />
              <Input
                label="Limite de leads"
                type="number"
                min={1}
                value={editing.limite_leads}
                onChange={e => setField('limite_leads', Number(e.target.value))}
                hint="99999 = ilimitado"
              />
            </div>

            {/* Flags */}
            <div className="flex gap-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.destaque}
                  onChange={e => setField('destaque', e.target.checked)}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: PLATFORM }}
                />
                <span className="text-[13px] font-medium text-ink-2">Plano destaque</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.ativo}
                  onChange={e => setField('ativo', e.target.checked)}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: PLATFORM }}
                />
                <span className="text-[13px] font-medium text-ink-2">Ativo (visível)</span>
              </label>
            </div>

            {/* Features */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-2">Funcionalidades</label>
              <div className="mb-2 space-y-1.5">
                {editing.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-control bg-raised px-3 py-2">
                    <span className="flex-1 text-[13px] text-ink">{f}</span>
                    <IconButton aria-label="Remover" size="sm" onClick={() => removeFeature(i)}>
                      <X size={13} strokeWidth={1.7} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  wrapperClassName="flex-1"
                  value={newFeature}
                  onChange={e => setNewFeature(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }}
                  placeholder="Nova funcionalidade…"
                />
                <Button icon={<Plus size={14} strokeWidth={1.7} />} onClick={addFeature} style={{ background: PLATFORM }} className="text-white hover:opacity-90" aria-label="Adicionar" />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
