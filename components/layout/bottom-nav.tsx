'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Target, Users, Menu, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverMenuPlano, type MenuOverridesSuperadmin, type MenuConfigDono, type SegOverride } from '@/lib/menu'
import { normalizarSegmento, type Segmento } from '@/lib/segmentos'
import { MENU_ICONS } from './menu-icons'
import { Drawer } from '@/components/ui'

interface BottomNavProps {
  segmento?: Segmento
  plano?: string
  role?: string
  isSuperAdmin?: boolean
  leadsCount?: number
  overrides?: MenuOverridesSuperadmin
  configDono?: MenuConfigDono
  segOverride?: SegOverride
}

// Ação central (FAB) por segmento.
const FAB: Record<string, { label: string; href: string }> = {
  varejo: { label: 'Vender', href: '/pdv' },
  food: { label: 'Vender', href: '/pdv' },
  assistencia: { label: 'Nova OS', href: '/assistencia' },
  servicos: { label: 'Novo', href: '/leads' },
  imobiliaria: { label: 'Visita', href: '/agenda' },
  saude: { label: 'Agenda', href: '/agenda' },
}

export function BottomNav({ segmento = 'varejo', plano, role = 'owner', isSuperAdmin = false, leadsCount = 0, overrides, configDono, segOverride }: BottomNavProps) {
  const seg = normalizarSegmento(segmento)
  const pathname = usePathname()
  const [maisOpen, setMaisOpen] = useState(false)
  // Uma lista, sem os cabeçalhos de grupo (decisão do dono, 20/08/2026).
  const itens = resolverMenuPlano({ segmento: seg, plano, role, isSuperAdmin, overrides, configDono, segOverride })
  const fab = FAB[seg] ?? { label: 'Novo lead', href: '/leads' }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const item = (href: string, label: string, Icon: typeof Home, badge?: number) => (
    <Link href={href} className={cn('flex flex-1 flex-col items-center gap-0.5 py-1.5', isActive(href) ? 'text-accent' : 'text-ink-3')}>
      <span className="relative">
        <Icon size={20} strokeWidth={1.7} />
        {badge ? <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )

  return (
    <>
      <nav className="z-40 flex shrink-0 items-stretch border-t border-line bg-card px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        {item('/dashboard', 'Início', Home)}
        {item('/leads', 'Leads', Target, leadsCount)}

        {/* FAB central */}
        <div className="flex w-16 flex-none items-start justify-center">
          <Link
            href={fab.href}
            className="-mt-4 flex flex-col items-center gap-0.5"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white shadow-[0_6px_16px_-4px_rgba(21,24,28,0.4)]">
              <Plus size={22} strokeWidth={2} />
            </span>
            <span className="text-[10px] font-medium text-ink-2">{fab.label}</span>
          </Link>
        </div>

        {item('/clientes', 'Clientes', Users)}
        <button onClick={() => setMaisOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-ink-3">
          <Menu size={20} strokeWidth={1.7} />
          <span className="text-[10px] font-medium">Mais</span>
        </button>
      </nav>

      <Drawer open={maisOpen} onClose={() => setMaisOpen(false)} title="Menu">
        <div className="grid grid-cols-2 gap-1.5">
          {itens.map((it) => {
            const Icon = MENU_ICONS[it.icon] ?? Home
            return (
              <Link
                key={it.href}
                href={it.locked ? `/admin/planos?upgrade=${it.modulo}` : it.href}
                onClick={() => setMaisOpen(false)}
                className={cn('flex items-center gap-2.5 rounded-control border border-line px-3 py-2.5 text-[13px] font-medium', isActive(it.href) ? 'bg-accent-soft text-accent' : 'text-ink')}
              >
                <Icon size={16} strokeWidth={1.7} className="flex-none opacity-85" />
                <span className="truncate">{it.label}</span>
              </Link>
            )
          })}
        </div>
      </Drawer>
    </>
  )
}
