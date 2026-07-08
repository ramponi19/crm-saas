'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Building2,
  Settings,
  UserCog,
  CreditCard,
  ArrowUpRight,
  LogOut,
  Crown,
  Plug,
  Wallet,
  BarChart3,
} from 'lucide-react'

const navItems = [
  { href: '/admin',               label: 'Visão geral',   icon: LayoutDashboard, exact: true },
  { href: '/admin/relatorios',    label: 'Relatórios',    icon: BarChart3 },
  { href: '/admin/financeiro',    label: 'Financeiro',    icon: Wallet },
  { href: '/admin/equipe',        label: 'Equipe',        icon: UserCog },
  { href: '/admin/empresa',       label: 'Minha empresa', icon: Building2 },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/admin/integracoes',   label: 'Integrações',   icon: Plug },
  { href: '/admin/planos',        label: 'Planos',        icon: CreditCard },
]

interface AdminSidebarProps {
  userName?: string
  empresaNome?: string
  role?: string
}

export function AdminSidebar({ userName = 'Administrador', empresaNome = 'Minha empresa', role = 'owner' }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex h-screen w-[216px] shrink-0 flex-col border-r border-line-soft bg-raised">

      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3.5">
        <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-ink text-white">
          <Crown size={15} strokeWidth={1.7} />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold tracking-[-0.02em] text-ink">{empresaNome}</div>
          <div className="text-[10px] font-medium text-ink-3">Administração</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2.5 scrollbar-thin">
        <p className="px-2.5 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">Administração</p>
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
                className={cn(
                  'flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-ink-2 hover:bg-line-soft hover:text-ink',
                )}
              >
                <Icon size={15} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* Acessar o CRM */}
        <div className="mt-4 border-t border-line-soft pt-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent-soft"
          >
            <ArrowUpRight size={15} strokeWidth={1.7} className="shrink-0" />
            <span className="flex-1 truncate">Acessar o CRM</span>
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-line-soft px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] font-semibold text-ink">{userName}</div>
            <div className="text-[10px] text-ink-3">{role === 'owner' ? 'Proprietário' : 'Administrador'}</div>
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
