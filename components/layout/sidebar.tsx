'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, BarChart3, ScanBarcode, Calculator, ReceiptText, Target,
  Smartphone, Boxes, BookOpen, Users, ShieldCheck, Wrench, ShoppingCart,
  Wallet, UserCog, Settings, Building2, CreditCard, LogOut, ShieldAlert,
  Lock, Home, KeyRound, Calendar, CheckSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { resolverMenu } from '@/lib/menu'
import { normalizarSegmento, type Segmento } from '@/lib/segmentos'

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, BarChart3, ScanBarcode, Calculator, ReceiptText, Target,
  Smartphone, Boxes, BookOpen, Users, ShieldCheck, Wrench, ShoppingCart,
  Wallet, UserCog, Settings, Building2, CreditCard, Home, KeyRound, Calendar, CheckSquare,
}

const PLANO_LABEL: Record<string, string> = { free: 'Plano Free', starter: 'Plano Starter', pro: 'Plano Pro' }

interface SidebarProps {
  userName?: string
  userRole?: string
  userEmpresa?: string
  leadsCount?: number
  garantiasCount?: number
  empresaLogo?: string | null
  isSuperAdmin?: boolean
  role?: string
  plano?: string
  segmento?: Segmento
}

export function Sidebar({
  userName = 'Administrador',
  userRole = 'Admin',
  userEmpresa,
  leadsCount = 0,
  garantiasCount = 0,
  empresaLogo = null,
  isSuperAdmin = false,
  role = 'owner',
  plano,
  segmento = 'varejo',
}: SidebarProps) {
  const seg = normalizarSegmento(segmento)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const isEmpresaAdmin = isSuperAdmin || role === 'owner' || role === 'admin'
  const grupos = resolverMenu({ segmento: seg, plano, role, isSuperAdmin })

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const iniciais = (userEmpresa ?? userName).slice(0, 2).toUpperCase()
  const badgeCount = (key?: string) =>
    key === 'leads' ? leadsCount : key === 'garantia' ? garantiasCount : 0

  return (
    <aside className="flex h-screen w-[216px] shrink-0 flex-col border-r border-line-soft bg-raised">

      {/* Brand — logo do tenant ou quadrado da marca */}
      <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3.5">
        {empresaLogo ? (
          <div className="grid h-[26px] w-[26px] shrink-0 place-items-center overflow-hidden rounded-[7px] bg-card">
            <Image src={empresaLogo} alt="Logo" width={26} height={26} className="object-contain" />
          </div>
        ) : (
          <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-jm text-[12px] font-bold text-white">
            {iniciais.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold tracking-[-0.02em] text-ink">{userEmpresa ?? 'Nexus'}</div>
          <div className="text-[10px] font-medium text-ink-3">{PLANO_LABEL[plano ?? ''] ?? 'Nexus CRM'}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2.5 scrollbar-thin">
        {grupos.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
              {group.label}
            </p>
            <div className="space-y-px">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard
                const isActive = !item.locked && (pathname === item.href || pathname.startsWith(item.href + '/'))
                const href = item.locked ? `/planos?upgrade=${item.modulo}` : item.href
                const badge = item.locked ? 0 : badgeCount(item.badge)

                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-medium transition-colors',
                      item.locked
                        ? 'text-ink-3 hover:text-ink-2'
                        : isActive
                          ? 'bg-accent-soft font-semibold text-accent'
                          : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink',
                    )}
                  >
                    <Icon size={15} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.locked ? (
                      <Lock size={12} strokeWidth={1.7} className="shrink-0 opacity-60" />
                    ) : badge > 0 ? (
                      <span className={cn('num text-[10px] font-semibold', isActive ? 'text-accent' : 'text-ink-3')}>{badge}</span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {/* Painel da plataforma (super admin) — roxo = modo plataforma */}
        {isSuperAdmin && (
          <div className="mt-4 border-t border-line-soft pt-3">
            <Link
              href="/superadmin"
              className="flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-semibold text-[#6D28D9] transition-colors hover:bg-[#6D28D9]/[0.08]"
            >
              <ShieldAlert size={15} strokeWidth={1.7} className="shrink-0" />
              <span className="flex-1 truncate">Painel da plataforma</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-line-soft px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] font-semibold text-ink">{userName}</div>
            <div className="text-[10px] text-ink-3">{userRole}</div>
          </div>
          {isEmpresaAdmin && (
            <Link href="/admin" aria-label="Administração" className="grid h-7 w-7 place-items-center rounded-control text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink">
              <Settings size={15} strokeWidth={1.7} />
            </Link>
          )}
          <button aria-label="Sair" className="grid h-7 w-7 place-items-center rounded-control text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink" onClick={handleLogout}>
            <LogOut size={15} strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </aside>
  )
}
