'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { Card, Button, Input, notify } from '@/components/ui'
import { cn } from '@/lib/utils'

const PLATFORM = '#6D28D9'

const MODULOS: { key: string; label: string }[] = [
  { key: 'bi', label: 'Relatórios (BI)' },
  { key: 'multi_usuario', label: 'Multiusuário' },
  { key: 'api', label: 'API' },
  { key: 'white_label', label: 'White-label' },
]

type Estado = 'herdado' | 'on' | 'off'
const ESTADOS: { v: Estado; label: string }[] = [
  { v: 'herdado', label: 'Herdado' },
  { v: 'on', label: 'Liberar' },
  { v: 'off', label: 'Bloquear' },
]

export function ControleEmpresa({ empresaId, modulosInit, menuOverrideInit, items, limiteUsuariosInit, limiteLeadsInit }: {
  empresaId: number
  modulosInit: Record<string, boolean> | null
  menuOverrideInit: { hidden?: string[]; labels?: Record<string, string> } | null
  items: { href: string; label: string }[]
  limiteUsuariosInit: number
  limiteLeadsInit: number
}) {
  const router = useRouter()
  const [modulos, setModulos] = useState<Record<string, Estado>>(() => {
    const m: Record<string, Estado> = {}
    for (const { key } of MODULOS) {
      const v = modulosInit?.[key]
      m[key] = v === true ? 'on' : v === false ? 'off' : 'herdado'
    }
    return m
  })
  const [hidden, setHidden] = useState<Set<string>>(new Set(menuOverrideInit?.hidden ?? []))
  const [labels, setLabels] = useState<Record<string, string>>(menuOverrideInit?.labels ?? {})
  const [limUsuarios, setLimUsuarios] = useState(String(limiteUsuariosInit))
  const [limLeads, setLimLeads] = useState(String(limiteLeadsInit))
  const [saving, setSaving] = useState(false)

  const toggle = (href: string) => setHidden((s) => { const n = new Set(s); n.has(href) ? n.delete(href) : n.add(href); return n })

  async function salvar() {
    setSaving(true)
    try {
      const mo: Record<string, boolean> = {}
      for (const { key } of MODULOS) { if (modulos[key] === 'on') mo[key] = true; else if (modulos[key] === 'off') mo[key] = false }
      const cleanLabels: Record<string, string> = {}
      for (const [k, v] of Object.entries(labels)) if (v.trim()) cleanLabels[k] = v.trim()
      const res = await fetch(`/api/superadmin/empresas/${empresaId}/overrides`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modulos_override: Object.keys(mo).length ? mo : null,
          menu_override: { hidden: [...hidden], labels: cleanLabels },
          limite_usuarios: Number(limUsuarios) || 0,
          limite_leads: Number(limLeads) || 0,
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok('Overrides salvos', 'O menu do tenant reflete as mudanças.')
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Limites da empresa">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Limite de usuários</span>
            <input value={limUsuarios} onChange={(e) => setLimUsuarios(e.target.value.replace(/[^0-9]/g, ''))} className="num rounded-control border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/30" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Limite de leads</span>
            <input value={limLeads} onChange={(e) => setLimLeads(e.target.value.replace(/[^0-9]/g, ''))} className="num rounded-control border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/30" />
          </label>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">0 = ilimitado. Vale para a criação de usuários e leads da empresa.</p>
      </Card>

      <Card title="Módulos do plano (override por empresa)">
        <div className="space-y-2.5">
          {MODULOS.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-ink">{m.label}</span>
              <div className="flex gap-0.5 rounded-control border border-line bg-raised p-0.5">
                {ESTADOS.map((e) => {
                  const active = modulos[m.key] === e.v
                  return (
                    <button
                      key={e.v}
                      onClick={() => setModulos((s) => ({ ...s, [m.key]: e.v }))}
                      className={cn('rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium transition-colors', active ? 'text-white' : 'text-ink-2 hover:text-ink')}
                      style={active ? { background: PLATFORM } : undefined}
                    >
                      {e.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-ink-3">“Herdado” segue a matriz do plano. “Liberar” concede como cortesia; “Bloquear” remove mesmo que o plano permita.</p>
      </Card>

      <Card title="Menu do tenant (ocultar / renomear)" flush>
        <div className="divide-y divide-line-soft">
          {items.map((it) => {
            const oculto = hidden.has(it.href)
            return (
              <div key={it.href} className={cn('flex items-center gap-3 px-4 py-2.5', oculto && 'opacity-55')}>
                <Input wrapperClassName="flex-1" value={labels[it.href] ?? ''} onChange={(e) => setLabels((l) => ({ ...l, [it.href]: e.target.value }))} placeholder={it.label} />
                <Button variant="ghost" size="sm" onClick={() => toggle(it.href)} icon={oculto ? <EyeOff size={14} strokeWidth={1.7} /> : <Eye size={14} strokeWidth={1.7} />}>
                  {oculto ? 'Oculto' : 'Visível'}
                </Button>
              </div>
            )
          })}
        </div>
      </Card>

      <Button onClick={salvar} loading={saving} className="!bg-[#6D28D9] hover:!bg-[#6D28D9]/90">Salvar controles</Button>
    </div>
  )
}
