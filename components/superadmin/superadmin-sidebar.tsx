'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Building2,
  LineChart,
  ScrollText,
  ShieldCheck,
  LogOut,
  ShieldAlert,
  CreditCard,
  Layers,
  FlaskConical,
  Megaphone,
  Car,
} from 'lucide-react'

const ADMIN_COR = '#6D28D9'

const navItems = [
  { href: '/superadmin',          label: 'Visão geral',     icon: LayoutDashboard, exact: true },
  { href: '/superadmin/empresas', label: 'Empresas',        icon: Building2 },
  { href: '/superadmin/segmentos', label: 'Segmentos',      icon: Layers },
  { href: '/superadmin/laboratorio', label: 'Laboratório',   icon: FlaskConical },
  { href: '/superadmin/fipe',     label: 'Tabela FIPE',     icon: Car },
  { href: '/superadmin/metricas', label: 'Métricas',        icon: LineChart },
  { href: '/superadmin/planos',   label: 'Planos',          icon: CreditCard },
  { href: '/superadmin/avisos',   label: 'Avisos',          icon: Megaphone },
  { href: '/superadmin/admins',   label: 'Administradores', icon: ShieldCheck },
  { href: '/superadmin/logs',     label: 'Logs',            icon: ScrollText },
]

interface SuperAdminSidebarProps {
  userName?: string
}

export function SuperAdminSidebar({ userName = 'Super Admin' }: SuperAdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden h-screen w-[216px] shrink-0 flex-col border-r border-line bg-raised md:flex">

      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3.5">
        <div
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px]"
          style={{ background: ADMIN_COR }}
        >
          <ShieldAlert size={15} strokeWidth={1.7} className="text-white" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold tracking-[-0.02em] text-ink">
            Super Admin
          </div>
          <div className="text-[10px] font-medium text-ink-3">Painel da plataforma</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5 scrollbar-thin">
        <div className="space-y-px">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                style={isActive ? { color: ADMIN_COR } : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-[#6D28D9]/[0.10] font-semibold'
                    : 'text-ink-2 hover:bg-line-soft hover:text-ink',
                )}
              >
                <Icon size={15} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-line-soft px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
            style={{ background: ADMIN_COR }}
          >
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] font-semibold text-ink">{userName}</div>
            <div className="text-[10px] text-ink-3">Super administrador</div>
          </div>
          <button
            aria-label="Sair"
            className="grid h-7 w-7 place-items-center rounded-control text-ink-2 transition-colors hover:bg-line-soft hover:text-ink"
            onClick={handleLogout}
          >
            <LogOut size={15} strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </aside>
  )
}
