'use client'

/**
 * Shell do complemento Tracker Ads — namespace /tracker.
 *
 * Visual próprio (teal + Sora), ISOLADO do tema "Precisão" do crm-saas: todas as
 * cores são valores Tailwind arbitrários hardcoded aqui, então nada do CRM muda.
 * Reusa o login/empresa do crm (o guard fica no layout).
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutGrid, MessagesSquare, CalendarDays, BarChart3, Contact,
  Send, ShieldCheck, Link2, Radar, GraduationCap, Settings, LogOut,
  Menu, X, Bell, ArrowLeft, ChevronDown, AlertTriangle, Sparkles,
} from 'lucide-react'

// Paleta Tracker (extraída do app original) — só usada aqui dentro.
const C = {
  bg: '#eef1f5',
  card: '#ffffff',
  ink: '#111e26',
  ink2: '#3a4b57',
  ink3: '#6b7680',
  line: '#e2e8ec',
  teal: '#00a884',
  tealDark: '#007e5f',
  tealSoft: 'rgba(0,168,132,0.10)',
}

const NAV = [
  { href: '/tracker', label: 'Dashboard', icon: LayoutGrid, exact: true },
  { href: '/tracker/conversas', label: 'Conversas', icon: MessagesSquare },
  { href: '/tracker/compromissos', label: 'Compromissos', icon: CalendarDays },
  { href: '/tracker/crm', label: 'CRM', icon: BarChart3 },
  { href: '/tracker/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/tracker/contatos', label: 'Contatos', icon: Contact },
  { href: '/tracker/disparos', label: 'Disparos', icon: Send },
  { href: '/tracker/qualidade', label: 'Qualidade', icon: ShieldCheck },
  { href: '/tracker/links', label: 'Links', icon: Link2 },
  { href: '/tracker/rastreamento', label: 'Rastreamento', icon: Radar },
  { href: '/tracker/academy', label: 'Academy', icon: GraduationCap },
]

export function TrackerShell({
  userName = 'Usuário',
  empresaNome = 'Minha empresa',
  children,
}: {
  userName?: string
  empresaNome?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [drawer, setDrawer] = useState(false)
  const [banner, setBanner] = useState(true)
  const [conta, setConta] = useState(false)
  const [status, setStatus] = useState<'online' | 'ocupado' | 'offline'>('online')

  async function sair() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  const Logo = () => (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] font-bold text-white" style={{ background: C.teal }}>7</span>
      <span className="text-[15px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Tracker Ads</span>
    </div>
  )

  const Nav = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col">
      <Logo />
      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1">
        {NAV.map((item) => {
          const active = isActive(item.href, item.exact)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}
              className="flex items-center gap-3 rounded-[9px] px-3 py-[9px] text-[13.5px] font-medium transition-colors"
              style={active
                ? { background: C.tealSoft, color: C.tealDark, fontWeight: 600 }
                : { color: C.ink2 }}>
              <Icon size={18} strokeWidth={1.8} style={{ opacity: active ? 1 : 0.8 }} />
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="border-t px-2.5 py-2" style={{ borderColor: C.line }}>
        <Link href="/tracker/configuracoes" onClick={onNavigate}
          className="flex items-center gap-3 rounded-[9px] px-3 py-[9px] text-[13.5px] font-medium transition-colors"
          style={isActive('/tracker/configuracoes') ? { background: C.tealSoft, color: C.tealDark, fontWeight: 600 } : { color: C.ink2 }}>
          <Settings size={18} strokeWidth={1.8} /> <span className="flex-1">Configurações</span>
        </Link>
        <Link href="/dashboard" onClick={onNavigate}
          className="mt-0.5 flex items-center gap-3 rounded-[9px] px-3 py-[9px] text-[13px] font-medium transition-colors" style={{ color: C.ink3 }}>
          <ArrowLeft size={17} strokeWidth={1.8} /> <span className="flex-1">Voltar ao CRM</span>
        </Link>
      </div>
    </div>
  )

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden" style={{ background: C.bg, color: C.ink, fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {/* Banner de notificação (topo, verde) */}
      {banner && (
        <div className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-white" style={{ background: C.teal }}>
          <Bell size={15} strokeWidth={2} />
          <span className="flex-1 truncate">Ative as notificações para receber mensagens mesmo com o app fechado</span>
          <button onClick={() => setBanner(false)} className="rounded-md px-2 py-0.5 text-[12px] font-semibold hover:bg-white/15">Fechar</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar desktop */}
        <aside className="hidden w-[220px] shrink-0 border-r md:block" style={{ background: C.card, borderColor: C.line }}>
          <Nav />
        </aside>

        {/* Drawer mobile */}
        {drawer && (
          <div className="fixed inset-0 z-[60] md:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false) }}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute left-0 top-0 h-full w-[260px] max-w-[82%] border-r shadow-2xl" style={{ background: C.card, borderColor: C.line }}>
              <button aria-label="Fechar" onClick={() => setDrawer(false)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.ink3 }}><X size={18} /></button>
              <Nav onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4" style={{ background: C.card, borderColor: C.line }}>
            <button aria-label="Menu" onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center rounded-lg border md:hidden" style={{ borderColor: C.line, color: C.ink }}><Menu size={18} /></button>
            <div className="flex-1" />
            <a href="/tracker/configuracoes" className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold sm:inline-flex" style={{ background: '#fdf6e9', color: '#a06f14' }}><AlertTriangle size={14} /> Completar setup</a>
            <button className="hidden items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[12.5px] font-semibold sm:inline-flex" style={{ borderColor: C.line, color: C.ink2 }}><CalendarDays size={14} /> Período</button>
            <button className="grid h-9 w-9 place-items-center rounded-full text-white" title="Abrir Atlas (Ctrl+K)" style={{ background: C.teal }}><Sparkles size={16} /></button>
            <button className="grid h-9 w-9 place-items-center rounded-full" style={{ background: C.bg, color: C.ink2 }}><Bell size={16} /></button>
            <div className="relative">
              <button onClick={() => setConta((v) => !v)} className="flex items-center gap-2 rounded-[9px] border px-2.5 py-1.5 text-[13px] font-semibold" style={{ borderColor: C.line, color: C.ink }}>
                <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: C.teal }}>{empresaNome.slice(0, 1).toUpperCase()}</span>
                <span className="max-w-[120px] truncate">{empresaNome}</span>
                <ChevronDown size={14} style={{ color: C.ink3 }} />
              </button>
              {conta && (
                <>
                  <div className="fixed inset-0 z-[65]" onClick={() => setConta(false)} />
                  <div className="absolute right-0 top-[calc(100%+6px)] z-[66] w-[280px] overflow-hidden rounded-[12px] border shadow-lg" style={{ borderColor: C.line, background: C.card }}>
                    <div className="border-b px-4 py-3" style={{ borderColor: C.line }}>
                      <div className="truncate text-[13px] font-semibold" style={{ color: C.ink }}>{userName}</div>
                    </div>
                    <div className="border-b px-4 py-3" style={{ borderColor: C.line }}>
                      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.ink3 }}>Status</div>
                      <div className="flex gap-1">
                        {([['online', 'Online', C.teal], ['ocupado', 'Ocupado', '#e0a423'], ['offline', 'Offline', C.ink3]] as const).map(([v, l, cor]) => (
                          <button key={v} onClick={() => setStatus(v)} className="flex flex-1 items-center justify-center gap-1 rounded-[8px] px-2 py-1.5 text-[11.5px] font-semibold" style={status === v ? { background: C.bg, color: C.ink } : { color: C.ink3 }}>
                            <span className="h-2 w-2 rounded-full" style={{ background: cor }} />{l}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10.5px]" style={{ color: C.ink3 }}>Só quem está Online recebe leads da distribuição automática.</p>
                    </div>
                    <div className="border-b px-2 py-2" style={{ borderColor: C.line }}>
                      <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.ink3 }}>Contas</div>
                      <div className="flex items-center gap-2 rounded-[9px] px-2 py-2" style={{ background: C.bg }}>
                        <span className="grid h-6 w-6 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: C.teal }}>{empresaNome.slice(0, 1).toUpperCase()}</span>
                        <span className="flex-1 truncate text-[13px] font-semibold" style={{ color: C.ink }}>{empresaNome}</span>
                        <span style={{ color: C.teal }}>✓</span>
                      </div>
                      <a href="/tracker/configuracoes" className="mt-1 flex items-center gap-2 rounded-[9px] px-2 py-2 text-[13px] font-medium" style={{ color: C.ink2 }}>+ Nova conta cliente</a>
                    </div>
                    <div className="py-1">
                      {[['Meu perfil', '/tracker/configuracoes'], ['Preferências', '/tracker/configuracoes'], ['Conexões', '/tracker/configuracoes'], ['Assinatura', '/tracker/configuracoes']].map(([l, h]) => (
                        <a key={l} href={h} className="block px-4 py-2 text-[13px] font-medium hover:bg-[#f1f4f6]" style={{ color: C.ink2 }}>{l}</a>
                      ))}
                      <button onClick={sair} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] font-semibold" style={{ color: '#d92d20' }}><LogOut size={14} /> Sair</button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button aria-label="Sair" onClick={sair} className="grid h-9 w-9 place-items-center rounded-full" style={{ background: C.bg, color: C.ink2 }} title={`Sair (${userName})`}><LogOut size={16} /></button>
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  )
}
