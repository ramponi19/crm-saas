'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, Settings, LogOut, ShieldAlert, Lock } from 'lucide-react'
import { resolverMenu, type MenuOverridesSuperadmin, type MenuConfigDono, type SegOverride } from '@/lib/menu'
import { normalizarSegmento, type Segmento } from '@/lib/segmentos'
import { MENU_ICONS } from './menu-icons'
import { resolveTheme, themeVars, type SidebarTheme } from '@/lib/wl-menu'

const PLANO_LABEL: Record<string, string> = { free: 'Plano Free', starter: 'Plano Starter', pro: 'Plano Pro' }
const HOVER = 'hover:bg-[color-mix(in_srgb,var(--sb-text)_8%,transparent)]'

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
  /** Tema da sidebar (white-label). Default = clara. */
  theme?: SidebarTheme
  overrides?: MenuOverridesSuperadmin
  configDono?: MenuConfigDono
  segOverride?: SegOverride
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
  theme,
  overrides,
  configDono,
  segOverride,
}: SidebarProps) {
  const seg = normalizarSegmento(segmento)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const t = theme ?? resolveTheme(null)
  const isEmpresaAdmin = isSuperAdmin || role === 'owner' || role === 'admin'
  const grupos = resolverMenu({ segmento: seg, plano, role, isSuperAdmin, overrides, configDono, segOverride })

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const iniciais = (userEmpresa ?? userName).slice(0, 2).toUpperCase()
  const badgeCount = (key?: string) => (key === 'leads' ? leadsCount : key === 'garantia' ? garantiasCount : 0)
  const strong = t.dark ? 'text-white' : 'text-ink'
  const faint = t.dark ? 'text-white/55' : 'text-ink-3'

  return (
    // `h-full`, não `h-screen`: o pai é h-[100dvh] com overflow-hidden. Com 100vh
    // a sidebar ficava MAIOR que o pai onde a barra do navegador ocupa espaço
    // (Safari/Chrome no Mac, celular), e o pai cortava o rodapé fora da tela.
    <aside
      className="hidden h-full min-h-0 w-[216px] shrink-0 flex-col md:flex"
      style={{ ...themeVars(t), background: 'var(--sb-bg)', borderRight: '1px solid color-mix(in srgb, var(--sb-text) 14%, transparent)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: '1px solid color-mix(in srgb, var(--sb-text) 12%, transparent)' }}>
        {empresaLogo ? (
          <div className="grid h-[26px] w-[26px] shrink-0 place-items-center overflow-hidden rounded-[7px] bg-card">
            <Image src={empresaLogo} alt="Logo" width={26} height={26} className="object-contain" />
          </div>
        ) : (
          <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-ink text-[12px] font-bold text-white">
            {iniciais.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <div className={cn('truncate text-[13px] font-bold tracking-[-0.02em]', strong)}>{userEmpresa ?? 'Nexus'}</div>
          <div className={cn('text-[10px] font-medium', faint)}>{PLANO_LABEL[plano ?? ''] ?? 'Nexus CRM'}</div>
        </div>
      </div>

      {/* Nav */}
      {/* `min-h-0` é o que faz o overflow funcionar: em coluna flex o item tem
          min-height:auto por padrão e NÃO encolhe abaixo do próprio conteúdo —
          então o nav crescia empurrando o rodapé para fora em vez de rolar. */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5 scrollbar-thin" style={{ color: 'var(--sb-text)' }}>
        {grupos.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.07em] opacity-60">{group.label}</p>
            <div className="space-y-px">
              {group.items.map((item) => {
                const Icon = MENU_ICONS[item.icon] ?? LayoutDashboard
                const isActive = !item.locked && (pathname === item.href || pathname.startsWith(item.href + '/'))
                const href = item.locked ? `/admin/planos?upgrade=${item.modulo}` : item.href
                const badge = item.locked ? 0 : badgeCount(item.badge)

                return (
                  <Link
                    key={item.href}
                    href={href}
                    style={isActive ? { background: 'var(--sb-active-bg)', color: 'var(--sb-active-text)' } : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-medium transition-colors',
                      item.locked ? 'opacity-50' : isActive ? 'font-semibold' : HOVER,
                    )}
                  >
                    <Icon size={15} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.locked ? (
                      <Lock size={12} strokeWidth={1.7} className="shrink-0 opacity-60" />
                    ) : badge > 0 ? (
                      <span className="num text-[10px] font-semibold" style={isActive ? undefined : { opacity: 0.7 }}>{badge}</span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {isSuperAdmin && (
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid color-mix(in srgb, var(--sb-text) 12%, transparent)' }}>
            <Link href="/superadmin" className={cn('flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-semibold text-[#7C5CFF]', HOVER)}>
              <ShieldAlert size={15} strokeWidth={1.7} className="shrink-0" />
              <span className="flex-1 truncate">Painel da plataforma</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User */}
      <div className="px-3 py-2.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--sb-text) 12%, transparent)' }}>
        <div className="flex items-center gap-2.5" style={{ color: 'var(--sb-text)' }}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className={cn('truncate text-[12px] font-semibold', strong)}>{userName}</div>
            <div className={cn('text-[10px]', faint)}>{userRole}</div>
          </div>
          {isEmpresaAdmin && (
            <Link href="/admin" aria-label="Administração" className={cn('grid h-7 w-7 place-items-center rounded-control transition-colors', HOVER)}>
              <Settings size={15} strokeWidth={1.7} />
            </Link>
          )}
          <button aria-label="Sair" className={cn('grid h-7 w-7 place-items-center rounded-control transition-colors', HOVER)} onClick={handleLogout}>
            <LogOut size={15} strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </aside>
  )
}
