'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, Settings, LogOut, ShieldAlert, Lock } from 'lucide-react'
import { resolverMenuPlano, type MenuOverridesSuperadmin, type MenuConfigDono, type SegOverride } from '@/lib/menu'
import { normalizarSegmento, type Segmento } from '@/lib/segmentos'
import { MENU_ICONS } from './menu-icons'
import { NavRolavel } from './nav-rolavel'
import { AusenciaPopover } from './ausencia-popover'
import { useChatNaoLidas } from '@/hooks/use-chat-nao-lidas'
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

  const { total: chatNaoLidas } = useChatNaoLidas()
  const t = theme ?? resolveTheme(null)
  const isEmpresaAdmin = isSuperAdmin || role === 'owner' || role === 'admin'
  /**
   * UMA LISTA, sem separador. O dono tirou os cabeçalhos "Hoje / Comercial /
   * Operação…" em 20/08/2026: com 19 itens eles ocupavam cinco linhas de altura
   * para dizer o que o próprio nome do item já diz.
   */
  const itens = resolverMenuPlano({ segmento: seg, plano, role, isSuperAdmin, overrides, configDono, segOverride })

  async function handleLogout() {
    // Fecha o registro de uso ANTES do signOut: depois dele não há mais sessão
    // para a rota autenticar, e a saída ficaria sem hora.
    await fetch('/api/acesso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'fechar' }) }).catch(() => {})
    await supabase.auth.signOut()
    router.push('/login')
  }

  const iniciais = (userEmpresa ?? userName).slice(0, 2).toUpperCase()
  // O contador do chat NAO vem do servidor como os outros: ele muda enquanto a
  // pessoa esta na tela, e recarregar a pagina para ver recado de colega e
  // exatamente a reclamacao que ele existe para resolver.
  const badgeCount = (key?: string) =>
    key === 'leads' ? leadsCount : key === 'garantia' ? garantiasCount : key === 'chat' ? chatNaoLidas : 0
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
      {/* `shrink-0` no topo e no rodapé: sem isso, em tela baixa quem cedia espaço
          era o rodapé — o nome do usuário aparecia esmagado sob o avatar. */}
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: '1px solid color-mix(in srgb, var(--sb-text) 12%, transparent)' }}>
        {empresaLogo ? (
          <div className="grid h-[26px] w-[26px] shrink-0 place-items-center overflow-hidden rounded-[7px] bg-card">
            {/*
              `unoptimized` NÃO é preguiça — é o que impede a sidebar de derrubar
              o CRM inteiro.

              `empresaLogo` é uma URL que o lojista digita em Minha empresa →
              Visual ("URL do logo"), então o host é arbitrário. O otimizador de
              imagem do Next recusa host que não esteja em `images.remotePatterns`
              e LANÇA — e esta barra aparece em toda tela do CRM. Não dá para
              listar hosts que o cliente ainda vai inventar.

              Hoje nenhum tenant tem logo, e por isso nunca estourou. As telas de
              OS e Proposta já faziam assim; a sidebar tinha ficado de fora.
            */}
            <Image src={empresaLogo} alt="Logo" width={26} height={26} className="object-contain" unoptimized />
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
      {/* Rolagem, aviso de corte e "ir até o item ativo" vivem no NavRolavel — as
          três barras (CRM, admin, plataforma) tinham o mesmo problema. */}
      <NavRolavel corFundo="var(--sb-bg)" className="px-2 py-2.5" style={{ color: 'var(--sb-text)' }}>
        <div className="space-y-px">
          {itens.map((item) => {
            const Icon = MENU_ICONS[item.icon] ?? LayoutDashboard
            const isActive = !item.locked && (pathname === item.href || pathname.startsWith(item.href + '/'))
            const href = item.locked ? `/admin/planos?upgrade=${item.modulo}` : item.href
            const badge = item.locked ? 0 : badgeCount(item.badge)

            return (
              <Link
                key={item.href}
                href={href}
                data-ativo={isActive || undefined}
                style={isActive ? { background: 'var(--sb-active-bg)', color: 'var(--sb-active-text)' } : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-medium transition-colors',
                  item.locked ? 'opacity-50' : isActive ? 'font-semibold' : HOVER,
                )}
              >
                <Icon size={15} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />
                <span className="flex-1 truncate">{item.label}</span>
                {/* Selo de maturidade: "beta" avisa o lojista que a tela
                    ainda muda, e "obra" só o superadmin vê — é o módulo que
                    ele está construindo, invisível para os tenants. */}
                {item.status === 'beta' && (
                  <span className="shrink-0 rounded-full bg-warn/15 px-1.5 text-[9px] font-bold uppercase tracking-wide text-warn">beta</span>
                )}
                {item.status === 'construcao' && (
                  <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[9px] font-bold uppercase tracking-wide text-accent">obra</span>
                )}
                {item.locked ? (
                  <Lock size={12} strokeWidth={1.7} className="shrink-0 opacity-60" />
                ) : badge > 0 ? (
                  <span className="num text-[10px] font-semibold" style={isActive ? undefined : { opacity: 0.7 }}>{badge}</span>
                ) : null}
              </Link>
            )
          })}
        </div>

        {isSuperAdmin && (
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid color-mix(in srgb, var(--sb-text) 12%, transparent)' }}>
            <Link href="/superadmin" className={cn('flex items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-semibold text-[#7C5CFF]', HOVER)}>
              <ShieldAlert size={15} strokeWidth={1.7} className="shrink-0" />
              <span className="flex-1 truncate">Painel da plataforma</span>
            </Link>
          </div>
        )}
      </NavRolavel>

      {/* User */}
      <div className="shrink-0 px-3 py-2.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--sb-text) 12%, transparent)' }}>
        <div className="flex items-center gap-2.5" style={{ color: 'var(--sb-text)' }}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
            {userName.slice(0, 2).toUpperCase()}
          </span>
          <AusenciaPopover userName={userName} userRole={userRole} nomeClasse={strong} papelClasse={faint} />
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
