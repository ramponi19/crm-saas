'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  Wrench,
  Truck,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  MessageCircle,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Visão Geral',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/leads', label: 'Leads', icon: MessageCircle, badge: null },
    ],
  },
  {
    label: 'Operações',
    items: [
      { href: '/pdv', label: 'PDV', icon: ShoppingCart },
      { href: '/clientes', label: 'Clientes', icon: Users },
      { href: '/estoque', label: 'Estoque', icon: Package },
      { href: '/assistencia', label: 'Assistência', icon: Wrench },
      { href: '/compras', label: 'Compras', icon: Truck },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/financeiro', label: 'Financeiro', icon: Wallet },
      { href: '/relatorios', label: 'Relatórios / BI', icon: BarChart3 },
      { href: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

interface SidebarProps {
  userName?: string
  userRole?: string
  leadsCount?: number
}

export function Sidebar({ userName = 'Administrador', userRole = 'Admin', leadsCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex flex-col h-screen w-[264px] border-r border-white/[0.06] bg-sidebar-gradient dark:bg-[linear-gradient(180deg,#0C1526_0%,#0A1120_100%)] shrink-0">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-[22px] border-b border-white/[0.05]">
        <div className="w-[46px] h-[46px] rounded-[13px] bg-gradient-to-br from-[#F6F3EB] to-[#DCD6C8] flex items-center justify-center shrink-0 shadow-[0_6px_18px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.5)]">
          <span className="font-sans font-extrabold text-[15px] text-[#0A111E] tracking-tight">JM</span>
        </div>
        <div className="leading-tight">
          <div className="font-sans font-extrabold text-[17px] tracking-[0.01em] text-[#F4F6F9]">JM STORE</div>
          <div className="font-mono text-[9px] tracking-[0.34em] text-[#F0353D] mt-[3px]">IMPORTADOS</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="font-mono text-[9.5px] tracking-[0.2em] text-[#3F516A] uppercase px-[14px] pb-[7px] pt-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                const badge = item.label === 'Leads' && leadsCount > 0 ? leadsCount : null

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-[11px] px-[14px] py-[11px] rounded-[11px] text-[13.5px] transition-all duration-150 group',
                      isActive
                        ? 'bg-[rgba(215,40,47,0.1)] text-[#F4F6F9] font-semibold'
                        : 'text-[#8A9BB0] hover:bg-white/[0.05] hover:text-[#D4DEEA]'
                    )}
                  >
                    {/* Active bar */}
                    <span
                      className={cn(
                        'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-[4px] bg-[#F0353D] transition-opacity duration-200',
                        isActive ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <Icon size={19} className="shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge && (
                      <span className="font-mono text-[10px] font-semibold text-[#F0353D] bg-[rgba(215,40,47,0.14)] px-[7px] py-[2px] rounded-full">
                        {badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-white/[0.05]">
        <div className="flex items-center gap-[11px] px-[11px] py-[9px] rounded-[13px] bg-white/[0.03]">
          <div className="w-[38px] h-[38px] rounded-[11px] bg-gradient-to-br from-[#D7282F] to-[#8E1B20] flex items-center justify-center font-bold text-[14px] text-white shrink-0">
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-[#E9EEF4] truncate">{userName}</div>
            <div className="text-[11px] text-[#5C6E84]">{userRole}</div>
          </div>
          <button className="text-[#5C6E84] hover:text-[#9FB0C2] transition-colors" onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}
