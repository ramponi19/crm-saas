'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, LayoutDashboard, Target, Users } from 'lucide-react'
import { Card, Button, notify } from '@/components/ui'
import { resolveTheme, contrastRatio, type WlMenu, type WlPreset } from '@/lib/wl-menu'
import { cn } from '@/lib/utils'

const CUSTOM_DEFAULT = { fundo: '#111A24', texto: '#93A2B5', ativo_fundo: '#1E2A3A', ativo_texto: '#FFFFFF' }

function MiniSidebar({ wl }: { wl: WlMenu }) {
  const t = resolveTheme(wl)
  const items = [
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: Target, label: 'Leads', active: false },
    { icon: Users, label: 'Clientes', active: false },
  ]
  return (
    <div className="w-full overflow-hidden rounded-card border border-line" style={{ background: t.bg }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid color-mix(in srgb, var(--x-text) 12%, transparent)', ['--x-text' as string]: t.text }}>
        <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-ink text-[9px] font-bold text-white">J</span>
        <span className="text-[12px] font-bold" style={{ color: t.dark ? '#fff' : '#15181C' }}>JM Store</span>
      </div>
      <div className="space-y-0.5 p-2">
        {items.map((it) => {
          const Icon = it.icon
          return (
            <div
              key={it.label}
              className="flex items-center gap-2 rounded-control px-2 py-1.5 text-[12px] font-medium"
              style={it.active ? { background: t.activeBg, color: t.activeText } : { color: t.text }}
            >
              <Icon size={14} strokeWidth={1.7} />
              {it.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PRESETS: { key: WlPreset; nome: string; wl: WlMenu }[] = [
  { key: 'clara', nome: 'Clara', wl: { preset: 'clara' } },
  { key: 'escura', nome: 'Escura', wl: { preset: 'escura' } },
]

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <div className="flex items-center gap-2 rounded-control border border-line bg-card px-2 py-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="num w-full bg-transparent text-[12px] text-ink outline-none" />
      </div>
    </label>
  )
}

export function AparenciaView({ initial }: { initial: WlMenu | null }) {
  const router = useRouter()
  const [preset, setPreset] = useState<WlPreset>(initial?.preset ?? 'clara')
  const [custom, setCustom] = useState({
    fundo: initial?.fundo ?? CUSTOM_DEFAULT.fundo,
    texto: initial?.texto ?? CUSTOM_DEFAULT.texto,
    ativo_fundo: initial?.ativo_fundo ?? CUSTOM_DEFAULT.ativo_fundo,
    ativo_texto: initial?.ativo_texto ?? CUSTOM_DEFAULT.ativo_texto,
  })
  const [saving, setSaving] = useState(false)

  const wl: WlMenu = preset === 'custom' ? { preset: 'custom', ...custom } : { preset }

  const cTexto = contrastRatio(custom.texto, custom.fundo)
  const cAtivo = contrastRatio(custom.ativo_texto, custom.ativo_fundo)
  const contrasteOk = preset !== 'custom' || ((cTexto == null || cTexto >= 4.5) && (cAtivo == null || cAtivo >= 4.5))

  async function salvar(payload: WlMenu | null) {
    setSaving(true)
    try {
      const res = await fetch('/api/aparencia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wl_menu: payload }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok('Aparência salva', 'A barra lateral já reflete o novo tema.')
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[820px] space-y-4">
        <p className="text-[13px] text-ink-2">
          Personalize a <b className="text-ink">barra lateral</b> da sua empresa. O resto do sistema mantém o tema padrão para preservar a legibilidade.
        </p>

        <Card title="Tema da barra">
          <div className="grid gap-3 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => setPreset(p.key)} className={cn('rounded-card border p-2 text-left transition-colors', preset === p.key ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:bg-bg')}>
                <MiniSidebar wl={p.wl} />
                <div className="mt-2 flex items-center justify-between px-1">
                  <span className="text-[12.5px] font-semibold text-ink">{p.nome}</span>
                  {preset === p.key && <Check size={15} strokeWidth={2} className="text-accent" />}
                </div>
              </button>
            ))}
            <button onClick={() => setPreset('custom')} className={cn('rounded-card border p-2 text-left transition-colors', preset === 'custom' ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:bg-bg')}>
              <MiniSidebar wl={{ preset: 'custom', ...custom }} />
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-[12.5px] font-semibold text-ink">Personalizar</span>
                {preset === 'custom' && <Check size={15} strokeWidth={2} className="text-accent" />}
              </div>
            </button>
          </div>
        </Card>

        {preset === 'custom' && (
          <Card title="Cores personalizadas">
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Fundo" value={custom.fundo} onChange={(v) => setCustom((c) => ({ ...c, fundo: v }))} />
              <ColorField label="Texto" value={custom.texto} onChange={(v) => setCustom((c) => ({ ...c, texto: v }))} />
              <ColorField label="Fundo do item ativo" value={custom.ativo_fundo} onChange={(v) => setCustom((c) => ({ ...c, ativo_fundo: v }))} />
              <ColorField label="Texto do item ativo" value={custom.ativo_texto} onChange={(v) => setCustom((c) => ({ ...c, ativo_texto: v }))} />
            </div>
            {!contrasteOk && (
              <div className="mt-4 rounded-card border border-bad/30 bg-bad-soft px-3 py-2.5 text-[12.5px] text-bad">
                Contraste insuficiente (mínimo 4.5:1). Texto×fundo: {cTexto?.toFixed(1) ?? '—'} · Ativo: {cAtivo?.toFixed(1) ?? '—'}. Clareie o texto ou escureça o fundo.
              </div>
            )}
          </Card>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={() => salvar(wl)} loading={saving} disabled={!contrasteOk}>Salvar aparência</Button>
          <Button variant="ghost" onClick={() => { setPreset('clara'); salvar({ preset: 'clara' }) }} disabled={saving}>Restaurar padrão</Button>
        </div>
      </div>
    </main>
  )
}
