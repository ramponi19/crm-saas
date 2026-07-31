'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { Card, Button, Input, notify } from '@/components/ui'
import { MENU_ICONS } from '@/components/layout/menu-icons'
import { LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MenuGroup } from '@/lib/menu'

const PROTEGIDOS = new Set(['/dashboard'])

export function MeuMenuView({ grupos, initialHidden, initialLabels }: {
  grupos: MenuGroup[]
  initialHidden: string[]
  initialLabels: Record<string, string>
}) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden))
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels)
  const [saving, setSaving] = useState(false)

  const toggle = (href: string) => setHidden((s) => {
    const n = new Set(s)
    if (n.has(href)) n.delete(href); else n.add(href)
    return n
  })

  async function salvar() {
    setSaving(true)
    try {
      const cleanLabels: Record<string, string> = {}
      for (const [k, v] of Object.entries(labels)) if (v.trim()) cleanLabels[k] = v.trim()
      const res = await fetch('/api/menu-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: [...hidden], labels: cleanLabels }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok('Menu salvo', 'A barra lateral já reflete as mudanças.')
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[720px] space-y-4">
        <p className="text-[13px] text-ink-2">
          Oculte módulos que sua empresa não usa e renomeie itens (ex.: <b className="text-ink">Clientes → Pacientes</b>).
          Dashboard e Configurações não podem ser ocultados.
        </p>

        {grupos.map((g) => (
          <Card key={g.label} title={g.label} flush>
            <div className="divide-y divide-line-soft">
              {g.items.map((item) => {
                const Icon = MENU_ICONS[item.icon] ?? LayoutDashboard
                const protegido = PROTEGIDOS.has(item.href)
                const oculto = hidden.has(item.href)
                return (
                  <div key={item.href} className={cn('flex items-center gap-3 px-4 py-2.5', oculto && 'opacity-55')}>
                    <Icon size={16} strokeWidth={1.7} className="flex-none text-ink-3" />
                    <Input
                      wrapperClassName="flex-1"
                      value={labels[item.href] ?? ''}
                      onChange={(e) => setLabels((l) => ({ ...l, [item.href]: e.target.value }))}
                      placeholder={item.label}
                    />
                    {protegido ? (
                      <span className="flex items-center gap-1 text-[11px] text-ink-3"><Lock size={13} strokeWidth={1.7} /> fixo</span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => toggle(item.href)} icon={oculto ? <EyeOff size={14} strokeWidth={1.7} /> : <Eye size={14} strokeWidth={1.7} />}>
                        {oculto ? 'Oculto' : 'Visível'}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        ))}

        <div className="flex items-center gap-2">
          <Button onClick={salvar} loading={saving}>Salvar menu</Button>
          <span className="text-[11.5px] text-ink-3">O placeholder cinza é o nome padrão; escreva para renomear.</span>
        </div>
      </div>
    </main>
  )
}
