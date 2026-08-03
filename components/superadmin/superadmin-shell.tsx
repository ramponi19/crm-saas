'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Building2, LineChart, ScrollText, ShieldCheck, LogOut,
  ShieldAlert, CreditCard, Layers, Megaphone, Car, Menu, X, Sparkles,
} from 'lucide-react'

const ADMIN_COR = '#6D28D9'

const navItems = [
  { href: '/superadmin', label: 'Visão geral', icon: LayoutDashboard, exact: true },
  { href: '/superadmin/empresas', label: 'Empresas', icon: Building2 },
  { href: '/superadmin/segmentos', label: 'Segmentos', icon: Layers },
  { href: '/superadmin/fipe', label: 'Tabela FIPE', icon: Car },
  { href: '/superadmin/metricas', label: 'Métricas', icon: LineChart },
  { href: '/superadmin/planos', label: 'Planos', icon: CreditCard },
  { href: '/superadmin/avisos', label: 'Avisos', icon: Megaphone },
  { href: '/superadmin/assistente', label: 'Assistente Nexus', icon: Sparkles },
  { href: '/superadmin/admins', label: 'Administradores', icon: ShieldCheck },
  { href: '/superadmin/logs', label: 'Logs', icon: ScrollText },
]

export function SuperAdminShell({ userName = 'Super Admin', children }: { userName?: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [drawer, setDrawer] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const Nav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3.5">
        <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px]" style={{ background: ADMIN_COR }}><ShieldAlert size={15} strokeWidth={1.7} className="text-white" /></div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold tracking-[-0.02em] text-ink">Super Admin</div>
          <div className="text-[10px] font-medium text-ink-3">Painel da plataforma</div>
        </div>
      </div>
      {/* `min-h-0`: sem ele o nav não encolhe (min-height:auto do flex) e o rodapé
          sai da tela em vez de o menu ganhar rolagem. */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5 scrollbar-thin">
        <div className="space-y-px">
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate}
                style={isActive ? { color: ADMIN_COR } : undefined}
                className={cn('flex items-center gap-2.5 rounded-control px-2.5 py-[9px] text-[13px] font-medium transition-colors',
                  isActive ? 'bg-[#6D28D9]/[0.10] font-semibold' : 'text-ink-2 hover:bg-line-soft hover:text-ink')}>
                <Icon size={16} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="border-t border-line-soft px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: ADMIN_COR }}>{userName.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] font-semibold text-ink">{userName}</div>
            <div className="text-[10px] text-ink-3">Super administrador</div>
          </div>
          <button aria-label="Sair" className="grid h-7 w-7 place-items-center rounded-control text-ink-2 transition-colors hover:bg-line-soft hover:text-ink" onClick={handleLogout}><LogOut size={15} strokeWidth={1.7} /></button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <aside className="hidden w-[216px] shrink-0 border-r border-line bg-raised md:block"><Nav /></aside>

      {drawer && (
        <div className="fixed inset-0 z-[60] md:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false) }}>
          <div className="absolute inset-0 bg-ink/40" />
          <div className="absolute left-0 top-0 h-full w-[260px] max-w-[82%] border-r border-line bg-raised shadow-[0_0_40px_rgba(0,0,0,0.2)]">
            <button aria-label="Fechar" onClick={() => setDrawer(false)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-control text-ink-3 hover:text-ink"><X size={18} strokeWidth={1.8} /></button>
            <Nav onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-card px-4 md:hidden">
          <button aria-label="Abrir menu" onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center rounded-control border border-line text-ink"><Menu size={18} strokeWidth={1.8} /></button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px]" style={{ background: ADMIN_COR }}><ShieldAlert size={13} strokeWidth={1.8} className="text-white" /></span>
            <span className="truncate text-[14px] font-bold tracking-[-0.02em] text-ink">Super Admin</span>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  )
}
