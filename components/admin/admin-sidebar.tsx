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

// Dourado ÁPICE (identidade evoluída) — distingue o painel do dono do superadmin (roxo)
const ADMIN_COR = '#C9A24B'

const navItems = [
  { href: '/admin',               label: 'Visão geral',   icon: LayoutDashboard, exact: true },
  { href: '/admin/relatorios',    label: 'Relatórios',    icon: BarChart3 },
  { href: '/admin/financeiro',    label: 'Financeiro',    icon: Wallet },
  { href: '/admin/equipe',        label: 'Equipe',        icon: UserCog },
  { href: '/admin/empresa',       label: 'Minha empresa', icon: Building2 },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/admin/integracoes',   label: 'Integrações',   icon: Plug },
  { href: '/planos',              label: 'Planos',        icon: CreditCard },
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
    <aside className="flex flex-col h-screen w-[264px] border-r border-[#16212E]/[0.08] bg-white shrink-0">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-[22px] border-b border-[#16212E]/[0.07]">
        <div
          className="w-[46px] h-[46px] rounded-[13px] flex items-center justify-center shrink-0 shadow-[0_6px_18px_rgba(201,162,75,0.35)]"
          style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, ${ADMIN_COR}88)` }}
        >
          <Crown size={22} className="text-white" />
        </div>
        <div className="leading-tight overflow-hidden">
          <div className="font-sans font-extrabold text-[15px] tracking-[0.01em] text-[#16212E] truncate">
            {empresaNome}
          </div>
          <div className="font-mono text-[9px] tracking-[0.3em] mt-[3px]" style={{ color: ADMIN_COR }}>
            ADMINISTRAÇÃO
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-0.5">
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
                'relative flex items-center gap-[11px] px-[14px] py-[11px] rounded-[11px] text-[13.5px] transition-all duration-150',
                isActive
                  ? 'text-[#16212E] font-semibold'
                  : 'text-[#788698] hover:bg-[#16212E]/[0.05] hover:text-[#56657A]'
              )}
              style={isActive ? { background: `${ADMIN_COR}18` } : {}}
            >
              <span
                className={cn(
                  'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-[4px] transition-opacity duration-200',
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
                style={{ background: ADMIN_COR }}
              />
              <Icon size={19} className="shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          )
        })}

        {/* Acessar o CRM */}
        <div className="pt-4 mt-4 border-t border-[#16212E]/[0.07]">
          <Link
            href="/dashboard"
            className="relative flex items-center gap-[11px] px-[14px] py-[12px] rounded-[11px] text-[13.5px] font-semibold text-white transition-all duration-150 hover:brightness-105"
            style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, #A8884A)` }}
          >
            <ArrowUpRight size={19} className="shrink-0" />
            <span className="flex-1 truncate">Acessar o CRM</span>
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-[#16212E]/[0.07]">
        <div className="flex items-center gap-[11px] px-[11px] py-[9px] rounded-[13px] bg-[#16212E]/[0.02]">
          <div
            className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center font-bold text-[14px] text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, ${ADMIN_COR}88)` }}
          >
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-[#1F2A39] truncate">{userName}</div>
            <div className="text-[11px] text-[#788698]">{role === 'owner' ? 'Proprietário' : 'Administrador'}</div>
          </div>
          <button className="text-[#788698] hover:text-[#9FB0C2] transition-colors" onClick={handleLogout} aria-label="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}
