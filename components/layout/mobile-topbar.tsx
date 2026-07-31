'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Menu, X, LayoutDashboard, LogOut, Lock, Settings } from 'lucide-react'
import { resolverMenu, type MenuOverridesSuperadmin, type MenuConfigDono, type SegOverride } from '@/lib/menu'
import { normalizarSegmento, type Segmento } from '@/lib/segmentos'
import { MENU_ICONS } from './menu-icons'

interface Props {
  empresaNome?: string
  empresaLogo?: string | null
  userName?: string
  leadsCount?: number
  garantiasCount?: number
  isSuperAdmin?: boolean
  role?: string
  plano?: string
  segmento?: Segmento
  overrides?: MenuOverridesSuperadmin
  configDono?: MenuConfigDono
  segOverride?: SegOverride
}

/**
 * Cabeçalho mobile do CRM: botão ☰ (canto superior esquerdo) que abre o menu
 * completo numa gaveta. Só aparece no celular (md:hidden). Substitui a barra
 * inferior, que não vinha ficando acessível. Mesmo padrão do /admin.
 */
export function MobileTopbar({
  empresaNome, empresaLogo = null, userName = 'Usuário', leadsCount = 0, garantiasCount = 0,
  isSuperAdmin = false, role = 'owner', plano, segmento = 'varejo', overrides, configDono, segOverride,
}: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const seg = normalizarSegmento(segmento)
  const grupos = resolverMenu({ segmento: seg, plano, role, isSuperAdmin, overrides, configDono, segOverride })
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const iniciais = (empresaNome ?? userName).slice(0, 2).toUpperCase()
  // A parametrização vive em /admin — o menu do CRM só precisa da porta de entrada.
  const isEmpresaAdmin = isSuperAdmin || role === 'owner' || role === 'admin'

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-card px-4 md:hidden">
        <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-control border border-line text-ink">
          <Menu size={18} strokeWidth={1.8} />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          {empresaLogo
            ? <Image src={empresaLogo} alt={empresaNome ?? 'Logo'} width={24} height={24} className="h-6 w-auto object-contain" />
            : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-ink text-[10px] font-bold text-white">{iniciais}</span>}
          <span className="truncate text-[14px] font-bold tracking-[-0.02em] text-ink">{empresaNome ?? 'Nexus'}</span>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="absolute inset-0 bg-ink/40" />
          <div className="absolute left-0 top-0 flex h-full w-[270px] max-w-[85%] flex-col border-r border-line bg-card shadow-[0_0_40px_rgba(0,0,0,0.2)]">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line-soft px-4">
              <span className="truncate text-[14px] font-bold tracking-[-0.02em] text-ink">{empresaNome ?? 'Nexus'}</span>
              <button aria-label="Fechar" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-control text-ink-3 hover:text-ink"><X size={18} strokeWidth={1.8} /></button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
              {grupos.map((g) => (
                <div key={g.label} className="mb-1.5">
                  <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">{g.label}</p>
                  <div className="space-y-px">
                    {g.items.map((it) => {
                      const Icon = MENU_ICONS[it.icon] ?? LayoutDashboard
                      const badge = it.badge === 'leads' ? leadsCount : it.badge === 'garantia' ? garantiasCount : 0
                      return (
                        <Link key={it.href} href={it.locked ? `/admin/planos?upgrade=${it.modulo}` : it.href} onClick={() => setOpen(false)}
                          className={cn('flex items-center gap-2.5 rounded-control px-2.5 py-2.5 text-[13.5px] font-medium transition-colors',
                            isActive(it.href) ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2 hover:bg-line-soft hover:text-ink')}>
                          <Icon size={16} strokeWidth={1.7} className="shrink-0 opacity-90" />
                          <span className="flex-1 truncate">{it.label}</span>
                          {badge > 0 && <span className="num rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{badge}</span>}
                          {it.locked && <Lock size={12} strokeWidth={1.8} className="text-ink-3" />}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}

              {isEmpresaAdmin && (
                <div className="mt-3 border-t border-line-soft pt-3">
                  <Link href="/admin" onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-control px-2.5 py-2.5 text-[13.5px] font-semibold text-accent transition-colors hover:bg-accent-soft">
                    <Settings size={16} strokeWidth={1.7} className="shrink-0" />
                    <span className="flex-1 truncate">Administração</span>
                  </Link>
                </div>
              )}
            </nav>
            <button onClick={handleLogout} className="flex shrink-0 items-center gap-2.5 border-t border-line-soft px-4 py-3 text-[13px] font-medium text-ink-2 hover:text-ink">
              <LogOut size={16} strokeWidth={1.7} /> Sair
            </button>
          </div>
        </div>
      )}
    </>
  )
}
