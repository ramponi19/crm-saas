'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, notify } from '@/components/ui'
import { MenuOrdenavel, type LayoutMenu } from '@/components/layout/menu-ordenavel'
import { cn } from '@/lib/utils'
import type { MenuGroup } from '@/lib/menu'

/**
 * O menu do CRM na mão do dono: ordem, nome e visibilidade de cada item.
 *
 * Nada é fixo — nem o Dashboard. Ocultar é só de MENU (a rota segue acessível), e
 * esta tela vive em /admin, fora do menu do CRM, então não há como o dono se
 * trancar para fora do próprio ajuste. A rota `/api/menu-config` tinha uma lista de
 * protegidos que a tela ignorava: o botão existia, o dono salvava e o item ficava
 * no menu sem explicação. Os dois lados agora concordam (20/08/2026).
 *
 * A ordem chega já resolvida do servidor (o `resolverMenu` aplica o que está
 * salvo), então o que se vê aqui é a ordem real do menu — não uma lista paralela
 * que precisa ser comparada de cabeça com a barra lateral.
 */
export function MeuMenuView({ grupos, initialHidden, initialLabels }: {
  grupos: MenuGroup[]
  initialHidden: string[]
  initialLabels: Record<string, string>
}) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden))
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels)
  const [ordem, setOrdem] = useState<LayoutMenu | null>(null)
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
        body: JSON.stringify({
          hidden: [...hidden],
          labels: cleanLabels,
          // Sem arrastar nada, manda o que já estava — não zera a ordem salva.
          ordem: ordem ?? montarLayout(grupos),
        }),
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
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[760px] space-y-4">
        <p className="text-[13px] text-ink-2">
          Arraste pela alça para mudar a ordem — inclusive de um grupo para outro. Renomeie itens
          (ex.: <b className="text-ink">Clientes → Pacientes</b>) e oculte o que sua empresa não usa.
          Ocultar tira do menu; a tela continua acessível por link.
        </p>

        <MenuOrdenavel
          grupos={grupos.map((g) => ({ label: g.label, items: g.items.map((i) => ({ href: i.href, label: i.label, icon: i.icon })) }))}
          onChange={setOrdem}
          renderExtra={(item) => {
            const oculto = hidden.has(item.href)
            return (
              <span className={cn('flex items-center gap-2', oculto && 'opacity-60')}>
                <Input
                  wrapperClassName="w-[190px]"
                  value={labels[item.href] ?? ''}
                  onChange={(e) => setLabels((l) => ({ ...l, [item.href]: e.target.value }))}
                  placeholder={item.label}
                  aria-label={`Novo nome para ${item.label}`}
                />
                <Button
                  variant="ghost" size="sm" onClick={() => toggle(item.href)}
                  icon={oculto ? <EyeOff size={14} strokeWidth={1.7} /> : <Eye size={14} strokeWidth={1.7} />}
                >
                  {oculto ? 'Oculto' : 'Visível'}
                </Button>
              </span>
            )
          }}
        />

        <div className="flex items-center gap-2">
          <Button onClick={salvar} loading={saving}>Salvar menu</Button>
          <span className="text-[11.5px] text-ink-3">O texto cinza é o nome padrão; escreva ao lado para renomear.</span>
        </div>
      </div>
    </main>
  )
}

/** A ordem que já está na tela, para salvar nome/visibilidade sem mexer na sequência. */
function montarLayout(grupos: MenuGroup[]): LayoutMenu {
  const layout: LayoutMenu = {}
  for (const g of grupos) layout[g.label] = g.items.map((i) => i.href)
  layout.__grupos = grupos.map((g) => g.label)
  return layout
}
