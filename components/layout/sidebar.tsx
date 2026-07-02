'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  BarChart3,
  ScanBarcode,
  Calculator,
  ReceiptText,
  Target,
  Smartphone,
  Boxes,
  BookOpen,
  Users,
  ShieldCheck,
  Wrench,
  ShoppingCart,
  Wallet,
  UserCog,
  Settings,
  Building2,
  CreditCard,
  LogOut,
  ShieldAlert,
  Lock,
  Crown,
  Home,
  KeyRound,
  Calendar,
  CheckSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { planoTemAcesso, type ModuloPlano } from '@/lib/plano'
import { moduloVisivel, labelDoItem, normalizarSegmento, SEGMENTOS, type Segmento } from '@/lib/segmentos'

// mapa de ícones para os módulos exclusivos de cada segmento (fase profunda)
const ICON_EXTRA: Record<string, LucideIcon> = { Home, KeyRound, BarChart3, Calendar, CheckSquare }

const navGroups = [
  {
    label: 'Visão Geral',
    items: [
      { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
      { href: '/relatorios', label: 'Relatórios', icon: BarChart3, modulo: 'bi' as ModuloPlano, adminOnly: true },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { href: '/pdv',             label: 'PDV',              icon: ScanBarcode },
      { href: '/simular-parcela', label: 'Simular Parcela',  icon: Calculator },
      { href: '/historico',       label: 'Histórico',        icon: ReceiptText },
      { href: '/leads',           label: 'Leads',            icon: Target,    badge: true },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { href: '/produtos',  label: 'Produtos',  icon: Smartphone },
      { href: '/estoque',   label: 'Estoque',   icon: Boxes },
      { href: '/catalogo',  label: 'Catálogo',  icon: BookOpen },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      { href: '/clientes',    label: 'Clientes',    icon: Users },
      { href: '/garantia',    label: 'Garantia',    icon: ShieldCheck, badge: true },
      { href: '/assistencia', label: 'Assistência', icon: Wrench },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/compras',    label: 'Compras',    icon: ShoppingCart },
      { href: '/financeiro', label: 'Financeiro', icon: Wallet, adminOnly: true },
      { href: '/equipe',     label: 'Equipe',     icon: UserCog, modulo: 'multi_usuario' as ModuloPlano, adminOnly: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/configuracoes', label: 'Configurações', icon: Settings,    adminOnly: true },
      { href: '/empresa',       label: 'Minha empresa', icon: Building2,   adminOnly: true },
      { href: '/planos',        label: 'Planos',        icon: CreditCard,  adminOnly: true },
    ],
  },
]

interface SidebarProps {
  userName?: string
  userRole?: string
  userEmpresa?: string
  leadsCount?: number
  garantiasCount?: number
  empresaCor?: string
  empresaLogo?: string | null
  isSuperAdmin?: boolean
  isEmpresaAdmin?: boolean
  plano?: string
  segmento?: Segmento
}

export function Sidebar({
  userName = 'Administrador',
  userRole = 'Admin',
  userEmpresa,
  leadsCount = 0,
  garantiasCount = 0,
  empresaCor = '#D7282F',
  empresaLogo = null,
  isSuperAdmin = false,
  isEmpresaAdmin = false,
  plano,
  segmento = 'varejo',
}: SidebarProps) {
  const seg = normalizarSegmento(segmento)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const iniciais = (userEmpresa ?? userName).slice(0, 2).toUpperCase()

  function getBadge(item: { href: string; label: string; badge?: boolean }) {
    if (item.label === 'Leads' && item.badge && leadsCount > 0) return leadsCount
    if (item.label === 'Garantia' && item.badge && garantiasCount > 0) return garantiasCount
    return null
  }

  return (
    <aside className="flex flex-col h-screen w-[264px] border-r border-[#16212E]/[0.08] bg-sidebar-gradient shrink-0">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-[22px] border-b border-[#16212E]/[0.07]">
        {empresaLogo ? (
          <div className="w-[46px] h-[46px] rounded-[13px] bg-white/[0.06] flex items-center justify-center shrink-0 overflow-hidden">
            <Image src={empresaLogo} alt="Logo" width={40} height={40} className="object-contain" />
          </div>
        ) : (
          <div
            className="w-[46px] h-[46px] rounded-[13px] flex items-center justify-center shrink-0 shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
            style={{ background: `linear-gradient(135deg, ${empresaCor}CC, ${empresaCor}66)` }}
          >
            <span className="font-sans font-extrabold text-[15px] text-white tracking-tight">{iniciais}</span>
          </div>
        )}
        <div className="leading-tight overflow-hidden">
          <div className="font-sans font-extrabold text-[15px] tracking-[0.01em] text-[#16212E] truncate">
            {userEmpresa ?? 'CRM Store'}
          </div>
          <div className="font-mono text-[9px] tracking-[0.3em] mt-[3px]" style={{ color: empresaCor }}>
            SISTEMA
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-4">
        {navGroups.map((group) => {
          // itens de GESTÃO (adminOnly) não aparecem no CRM — vivem só no /admin
          const items = group.items.filter((item) =>
            moduloVisivel(seg, item.href) &&
            !('adminOnly' in item && item.adminOnly)
          )
          if (items.length === 0) return null
          return (
          <div key={group.label}>
            <p className="font-mono text-[9.5px] tracking-[0.2em] text-[#9AA7B6] uppercase px-[14px] pb-[7px] pt-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const locked = !isSuperAdmin && 'modulo' in item && item.modulo
                  ? !planoTemAcesso(plano, item.modulo)
                  : false
                const isActive = !locked && (pathname === item.href || pathname.startsWith(item.href + '/'))
                const Icon = item.icon
                const badge = locked ? null : getBadge(item)
                const href = locked ? `/planos?upgrade=${(item as { modulo: ModuloPlano }).modulo}` : item.href

                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      'relative flex items-center gap-[11px] px-[14px] py-[11px] rounded-[11px] text-[13.5px] transition-all duration-150 group',
                      locked
                        ? 'text-[#9AA7B6] opacity-60 hover:opacity-80'
                        : isActive
                          ? 'text-[#16212E] font-semibold'
                          : 'text-[#788698] hover:bg-[#16212E]/[0.05] hover:text-[#56657A]'
                    )}
                    style={isActive ? { background: `${empresaCor}18` } : {}}
                  >
                    <span
                      className={cn(
                        'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-[4px] transition-opacity duration-200',
                        isActive ? 'opacity-100' : 'opacity-0'
                      )}
                      style={{ background: empresaCor }}
                    />
                    <Icon size={19} className="shrink-0" />
                    <span className="flex-1 truncate">{labelDoItem(seg, item.href, item.label)}</span>
                    {locked
                      ? <Lock size={13} className="shrink-0 opacity-60" />
                      : badge && (
                        <span
                          className="font-mono text-[10px] font-semibold px-[7px] py-[2px] rounded-full"
                          style={{ color: empresaCor, background: `${empresaCor}22` }}
                        >
                          {badge}
                        </span>
                      )
                    }
                  </Link>
                )
              })}
            </div>
          </div>
          )
        })}

        {SEGMENTOS[seg].modulosExtra && SEGMENTOS[seg].modulosExtra!.length > 0 && (
          <div>
            <p className="font-mono text-[9.5px] tracking-[0.2em] text-[#9AA7B6] uppercase px-[14px] pb-[7px] pt-1">
              {SEGMENTOS[seg].label}
            </p>
            <div className="space-y-0.5">
              {SEGMENTOS[seg].modulosExtra!.map((item) => {
                const Icon = ICON_EXTRA[item.icon] ?? Home
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-[11px] px-[14px] py-[11px] rounded-[11px] text-[13.5px] transition-all duration-150',
                      isActive ? 'text-[#16212E] font-semibold' : 'text-[#788698] hover:bg-[#16212E]/[0.05] hover:text-[#56657A]'
                    )}
                    style={isActive ? { background: `${empresaCor}18` } : {}}
                  >
                    <span
                      className={cn('absolute left-0 top-2 bottom-2 w-[3px] rounded-r-[4px] transition-opacity duration-200', isActive ? 'opacity-100' : 'opacity-0')}
                      style={{ background: empresaCor }}
                    />
                    <Icon size={19} className="shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Administração (dono/admin da empresa) */}
      {isEmpresaAdmin && (
        <div className="px-3 pb-1">
          <Link
            href="/admin"
            className="relative flex items-center gap-[11px] px-[14px] py-[11px] rounded-[11px] text-[13.5px] font-semibold text-white transition-all duration-150 hover:brightness-105"
            style={{ background: 'linear-gradient(135deg, #C9A24B, #A8884A)' }}
          >
            <Crown size={19} className="shrink-0" />
            <span className="flex-1 truncate">Administração</span>
          </Link>
        </div>
      )}

      {/* Super Admin (somente para super admins) */}
      {isSuperAdmin && (
        <div className="px-3 pb-1">
          <Link
            href="/superadmin"
            className="relative flex items-center gap-[11px] px-[14px] py-[11px] rounded-[11px] text-[13.5px] font-semibold text-white transition-all duration-150"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}
          >
            <ShieldAlert size={19} className="shrink-0" />
            <span className="flex-1 truncate">Painel Super Admin</span>
          </Link>
        </div>
      )}

      {/* User */}
      <div className="px-3 py-3 border-t border-[#16212E]/[0.07]">
        <div className="flex items-center gap-[11px] px-[11px] py-[9px] rounded-[13px] bg-white/[0.03]">
          <div
            className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center font-bold text-[14px] text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${empresaCor}, ${empresaCor}88)` }}
          >
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-[#1F2A39] truncate">{userName}</div>
            <div className="text-[11px] text-[#788698]">{userRole}</div>
          </div>
          <button className="text-[#788698] hover:text-[#9FB0C2] transition-colors" onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}
