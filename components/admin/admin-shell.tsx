'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NavRolavel } from '@/components/layout/nav-rolavel'
import { createClient } from '@/lib/supabase/client'
import { ImpersonationBanner } from '@/components/superadmin/impersonation-banner'
import {
  LayoutDashboard, Building2, Settings, UserCog, CreditCard, ArrowUpRight,
  LogOut, Crown, Wallet, BarChart3, Menu, X,
  GitBranch, Repeat, Split, Flame, MessageSquareText, Shield, Palette,
  SlidersHorizontal, Link2, FileSignature, Filter, Gauge, Store,
} from 'lucide-react'

/**
 * Nav do painel do DONO. Aqui vive TODA a parametrização da empresa — o antigo
 * grupo "Sistema" do CRM foi movido pra cá (funcionário não parametriza nada).
 */
const navGroups = [
  {
    label: 'Administração',
    items: [
      { href: '/admin', label: 'Visão geral', icon: LayoutDashboard, exact: true },
      { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
      { href: '/admin/financeiro', label: 'Financeiro', icon: Wallet },
      { href: '/admin/equipe', label: 'Equipe', icon: UserCog },
      { href: '/admin/conversao', label: 'Conversão', icon: Filter },
      { href: '/admin/metas', label: 'Meta da empresa', icon: Gauge },
    ],
  },
  {
    label: 'Motor de vendas',
    items: [
      { href: '/admin/funil', label: 'Funil', icon: GitBranch },
      { href: '/admin/cadencias', label: 'Cadências', icon: Repeat },
      { href: '/admin/distribuicao', label: 'Distribuição', icon: Split },
      { href: '/admin/scoring', label: 'Lead scoring', icon: Flame },
      { href: '/admin/modelos', label: 'Modelos', icon: MessageSquareText },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/admin/contrato', label: 'Contrato', icon: FileSignature },
      // "Canais" saiu: era o mesmo assunto de Integrações, e o conector do
      // WhatsApp/Instagram agora mora lá dentro. A rota /admin/canais redireciona.
      { href: '/admin/integracoes', label: 'Integrações', icon: Link2 },
      { href: '/admin/permissoes', label: 'Permissões', icon: Shield },
      { href: '/admin/meu-menu', label: 'Menu do CRM', icon: SlidersHorizontal },
      { href: '/admin/aparencia', label: 'Aparência', icon: Palette },
      { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
      { href: '/admin/empresa', label: 'Minha empresa', icon: Building2 },
      // Ao lado de "Minha empresa" porque é o mesmo assunto: cadastro da casa.
      { href: '/admin/filiais', label: 'Filiais', icon: Store },
      { href: '/admin/planos', label: 'Planos', icon: CreditCard },
    ],
  },
]

export function AdminShell({ userName = 'Administrador', empresaNome = 'Minha empresa', role = 'owner', impersonationNome = null, zapintelAtivo = false, children }: {
  userName?: string; empresaNome?: string; role?: string; impersonationNome?: string | null; zapintelAtivo?: boolean; children: React.ReactNode
}) {
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
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line-soft px-4 py-3.5">
        <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-ink text-white"><Crown size={15} strokeWidth={1.7} /></div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold tracking-[-0.02em] text-ink">{empresaNome}</div>
          <div className="text-[10px] font-medium text-ink-3">Administração</div>
        </div>
      </div>
      {/* Rolagem, aviso de corte e "ir até o item ativo" — ver NavRolavel. O menu
          de administração tem 19 itens e cortava sem avisar em tela de notebook. */}
      <NavRolavel classeGradiente="from-raised" className="px-2 py-2.5">
        {/* Complemento pago ZapIntel — só aparece quando o super admin ativou o
            add-on para esta empresa. É área própria (/zapintel), por isso Link
            direto com a cor da marca. */}
        {zapintelAtivo && (
          <div className="mb-1.5">
            <Link href="/zapintel" onClick={onNavigate}
              className="flex items-center gap-2.5 rounded-control px-2.5 py-[9px] text-[13px] font-semibold transition-colors hover:opacity-90"
              style={{ background: 'rgba(124,92,252,0.10)', color: '#6d28d9' }}>
              <MessageSquareText size={16} strokeWidth={1.7} className="shrink-0" />
              <span className="flex-1 truncate">ZapIntel</span>
              <ArrowUpRight size={14} strokeWidth={1.7} className="shrink-0 opacity-70" />
            </Link>
          </div>
        )}
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">{group.label}</p>
            <div className="space-y-px">
              {group.items.map((item) => {
                const exact = 'exact' in item && item.exact
                const isActive = exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate}
                    data-ativo={isActive || undefined}
                    className={cn('flex items-center gap-2.5 rounded-control px-2.5 py-[9px] text-[13px] font-medium transition-colors',
                      isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2 hover:bg-line-soft hover:text-ink')}>
                    <Icon size={16} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
        <div className="mt-4 border-t border-line-soft pt-3">
          <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 rounded-control px-2.5 py-[9px] text-[13px] font-semibold text-accent transition-colors hover:bg-accent-soft">
            <ArrowUpRight size={16} strokeWidth={1.7} className="shrink-0" /><span className="flex-1 truncate">Acessar o CRM</span>
          </Link>
        </div>
      </NavRolavel>
      <div className="shrink-0 border-t border-line-soft px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{userName.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] font-semibold text-ink">{userName}</div>
            <div className="text-[10px] text-ink-3">{role === 'owner' ? 'Proprietário' : 'Administrador'}</div>
          </div>
          <button aria-label="Sair" className="grid h-7 w-7 place-items-center rounded-control text-ink-2 transition-colors hover:bg-line-soft hover:text-ink" onClick={handleLogout}><LogOut size={15} strokeWidth={1.7} /></button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      {/* Sidebar desktop */}
      <aside className="hidden w-[216px] shrink-0 border-r border-line-soft bg-raised md:block"><Nav /></aside>

      {/* Drawer mobile */}
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
        {/* Cabeçalho mobile com hambúrguer */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-card px-4 md:hidden">
          <button aria-label="Abrir menu" onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center rounded-control border border-line text-ink"><Menu size={18} strokeWidth={1.8} /></button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-ink text-white"><Crown size={13} strokeWidth={1.8} /></span>
            <span className="truncate text-[14px] font-bold tracking-[-0.02em] text-ink">{empresaNome}</span>
          </div>
        </header>
        {impersonationNome && <ImpersonationBanner empresaNome={impersonationNome} />}
        {/* Mesmo contexto do <main> do CRM: as telas movidas do grupo "Sistema"
            usam `flex-1 overflow-y-auto` / `h-full` e precisam da coluna flex.
            O overflow aqui cobre as telas simples, que rolam por fora. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  )
}
