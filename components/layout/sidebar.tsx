'use client'

import { LinkDeMenu } from '@/components/layout/link-de-menu'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Settings, LogOut, ShieldAlert, Lock, CircleHelp, Bell,
  ChevronDown, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { resolverMenuAgrupado, type MenuItem, type MenuOverridesSuperadmin, type MenuConfigDono, type SegOverride } from '@/lib/menu'
import { normalizarSegmento, type Segmento } from '@/lib/segmentos'
import { MENU_ICONS } from './menu-icons'
import { NavRolavel } from './nav-rolavel'
import { AusenciaPopover } from './ausencia-popover'
import { useMenuEstado } from './use-menu-estado'
import { useChatNaoLidas } from '@/hooks/use-chat-nao-lidas'
import { resolveTheme, themeVars, type SidebarTheme } from '@/lib/wl-menu'

const PLANO_LABEL: Record<string, string> = { free: 'Plano Free', starter: 'Plano Starter', pro: 'Plano Pro' }
const HOVER = 'hover:bg-[color-mix(in_srgb,var(--sb-text)_8%,transparent)]'
const LINHA = '1px solid color-mix(in srgb, var(--sb-text) 12%, transparent)'

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
  /** Camada da Central de Módulos (href → instalado?). */
  instalados?: Record<string, boolean>
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
  instalados,
}: SidebarProps) {
  const seg = normalizarSegmento(segmento)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { recolhido: recolhidoGuardado, fechados, alternarRecolhido, alternarGrupo } = useMenuEstado()
  /**
   * Em Configurações o menu vira trilho sozinho (como no Kommo): a tela tem o menu
   * lateral dela e precisa da largura. Abrir ali vale só ali — não mexe na escolha
   * guardada para o resto do CRM.
   */
  const emConfiguracoes = pathname.startsWith('/configuracoes')
  const [abertoNaConfig, setAbertoNaConfig] = useState(false)
  const recolhido = emConfiguracoes ? !abertoNaConfig : recolhidoGuardado
  const alternar = emConfiguracoes ? () => setAbertoNaConfig((v) => !v) : alternarRecolhido

  const { total: chatNaoLidas } = useChatNaoLidas()
  const t = theme ?? resolveTheme(null)
  /**
   * GRUPOS COM VERBO (21/10/2026) — ver `resolverMenuAgrupado` em lib/menu.ts.
   * De 20/08 a 21/10 foi uma lista só, sem cabeçalho (os grupos de então só
   * repetiam o nome do item). Itens, rótulos, cadeados e ordem continuam saindo
   * das mesmas camadas; só a repartição é nova.
   */
  const grupos = resolverMenuAgrupado({ segmento: seg, plano, role, isSuperAdmin, overrides, configDono, segOverride, instalados })

  // O sino mora no topo (com o tempo real dele); o rodapé só abre e mostra o ponto.
  const [temNotificacao, setTemNotificacao] = useState(false)
  useEffect(() => {
    const ouvir = (e: Event) => setTemNotificacao(((e as CustomEvent<number>).detail ?? 0) > 0)
    window.addEventListener('notificacoes:total', ouvir)
    return () => window.removeEventListener('notificacoes:total', ouvir)
  }, [])

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
  const ativo = (item: MenuItem) => !item.locked && (pathname === item.href || pathname.startsWith(item.href + '/'))

  // Função de desenho, não componente: componente declarado aqui dentro seria
  // outro tipo a cada render (o React remontaria o link e o lint barra).
  function desenharItem(item: MenuItem, recuo?: boolean) {
    const Icon = MENU_ICONS[item.icon] ?? LayoutDashboard
    const isActive = ativo(item)
    const href = item.locked ? `/configuracoes/faturamento?upgrade=${item.modulo}` : item.href
    const badge = item.locked ? 0 : badgeCount(item.badge)
    return (
      <LinkDeMenu
        key={item.href}
        href={href}
        data-ativo={isActive || undefined}
        title={recolhido ? item.label : undefined}
        aria-label={recolhido ? item.label : undefined}
        style={isActive ? { background: 'var(--sb-active-bg)', color: 'var(--sb-active-text)' } : undefined}
        className={cn(
          'relative flex items-center gap-2.5 rounded-control py-[7px] text-[12.5px] font-medium transition-colors',
          recolhido ? 'justify-center px-0' : recuo ? 'pl-[35px] pr-2.5' : 'px-2.5',
          item.locked ? 'opacity-50' : isActive ? 'font-semibold' : HOVER,
        )}
      >
        {/* Dentro do grupo, aberto, o item é só texto: o ícone do grupo já diz onde se
            está, e repetir ("Estoque ▸ Estoque" com o mesmo desenho) é ruído. No trilho
            o ícone é tudo o que sobra, então ele volta. */}
        {(recolhido || !recuo) && <Icon size={15} strokeWidth={1.7} className={cn('shrink-0', !isActive && 'opacity-85')} />}
        {recolhido ? (
          badge > 0 && <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-accent" />
        ) : (
          <>
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
          </>
        )}
      </LinkDeMenu>
    )
  }

  /** Linha do rodapé: mesmo desenho do item, para link ou botão. */
  const rodapeClasse = cn('relative flex w-full items-center gap-2.5 rounded-control py-[7px] text-[12.5px] font-medium transition-colors', recolhido ? 'justify-center px-0' : 'px-2.5', HOVER)

  return (
    // `h-full`, não `h-screen`: o pai é h-[100dvh] com overflow-hidden. Com 100vh
    // a sidebar ficava MAIOR que o pai onde a barra do navegador ocupa espaço
    // (Safari/Chrome no Mac, celular), e o pai cortava o rodapé fora da tela.
    <aside
      className={cn('hidden h-full min-h-0 shrink-0 flex-col transition-[width] duration-150 md:flex', recolhido ? 'w-[56px]' : 'w-[216px]')}
      style={{ ...themeVars(t), background: 'var(--sb-bg)', borderRight: '1px solid color-mix(in srgb, var(--sb-text) 14%, transparent)' }}
    >
      {/* Brand */}
      {/* `shrink-0` no topo e no rodapé: sem isso, em tela baixa quem cedia espaço
          era o rodapé — o nome do usuário aparecia esmagado sob o avatar. */}
      <div className={cn('flex shrink-0 items-center gap-2.5 py-3.5', recolhido ? 'flex-col px-2' : 'px-4')} style={{ borderBottom: LINHA }}>
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
        {!recolhido && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className={cn('truncate text-[13px] font-bold tracking-[-0.02em]', strong)}>{userEmpresa ?? 'Nexus'}</div>
            <div className={cn('text-[10px] font-medium', faint)}>{PLANO_LABEL[plano ?? ''] ?? 'Nexus CRM'}</div>
          </div>
        )}
        {/* Recolher fica ao lado do logo (como no Kommo): é onde o olho procura. */}
        <button
          type="button"
          onClick={alternar}
          aria-label={recolhido ? 'Abrir menu' : 'Recolher menu'}
          title={recolhido ? 'Abrir menu' : 'Recolher menu'}
          className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-control transition-colors', faint, HOVER)}
        >
          {recolhido ? <PanelLeftOpen size={14} strokeWidth={1.7} /> : <PanelLeftClose size={14} strokeWidth={1.7} />}
        </button>
      </div>

      {/* Nav */}
      {/* Rolagem, aviso de corte e "ir até o item ativo" vivem no NavRolavel — as
          três barras (CRM, admin, plataforma) tinham o mesmo problema. */}
      <NavRolavel corFundo="var(--sb-bg)" className="px-2 py-2.5" style={{ color: 'var(--sb-text)' }}>
        <div className="space-y-px">
          {grupos.map((g, gi) => {
            /**
             * Grupo de UM item é o próprio item, sem gaveta: abrir "Comunicação"
             * para achar só o Chat seria um clique a mais por nada.
             */
            if (g.itens.length === 1) {
              return (
                <div key={g.id} className={cn(recolhido && gi > 0 && 'mt-1.5 pt-1.5')} style={recolhido && gi > 0 ? { borderTop: LINHA } : undefined}>
                  {desenharItem(g.itens[0])}
                </div>
              )
            }
            // O grupo de onde a pessoa está fica aberto: é a primeira coisa que ela procura.
            const temAtivo = g.itens.some(ativo)
            const aberto = temAtivo || !fechados.includes(g.id)
            if (recolhido) {
              return (
                <div key={g.id} className={cn('space-y-px', gi > 0 && 'mt-1.5 pt-1.5')} style={gi > 0 ? { borderTop: LINHA } : undefined}>
                  {g.itens.map((item) => desenharItem(item))}
                </div>
              )
            }
            const GIcon = MENU_ICONS[g.icon] ?? LayoutDashboard
            // Fechado, o grupo carrega a soma dos contadores: ninguém deixa de ver 441 leads novos por ter fechado a gaveta.
            const somaBadge = aberto ? 0 : g.itens.reduce((s, i) => s + (i.locked ? 0 : badgeCount(i.badge)), 0)
            return (
              <div key={g.id}>
                <button
                  type="button"
                  onClick={() => alternarGrupo(g.id)}
                  aria-expanded={aberto}
                  disabled={temAtivo}
                  className={cn('flex w-full items-center gap-2.5 rounded-control px-2.5 py-[7px] text-[12.5px] font-medium transition-colors', HOVER, temAtivo && 'cursor-default')}
                >
                  <GIcon size={15} strokeWidth={1.7} className="shrink-0 opacity-85" />
                  <span className="flex-1 truncate text-left">{g.label}</span>
                  {somaBadge > 0 && <span className="num text-[10px] font-semibold opacity-70">{somaBadge}</span>}
                  <ChevronDown size={13} strokeWidth={1.7} className={cn('shrink-0 opacity-60 transition-transform', !aberto && '-rotate-90')} />
                </button>
                {aberto && (
                  <div className="space-y-px">
                    {g.itens.map((item) => desenharItem(item, true))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {isSuperAdmin && (
          <div className="mt-4 pt-3" style={{ borderTop: LINHA }}>
            <LinkDeMenu href="/superadmin" title={recolhido ? 'Painel da plataforma' : undefined}
              className={cn('flex items-center gap-2.5 rounded-control py-[7px] text-[12.5px] font-semibold text-[#7C5CFF]', recolhido ? 'justify-center' : 'px-2.5', HOVER)}>
              <ShieldAlert size={15} strokeWidth={1.7} className="shrink-0" />
              {!recolhido && <span className="flex-1 truncate">Painel da plataforma</span>}
            </LinkDeMenu>
          </div>
        )}
      </NavRolavel>

      {/* Rodapé fixo: Configurações, Ajuda, Notificações e a conta. */}
      <div className="shrink-0 px-2 py-2" style={{ borderTop: LINHA, color: 'var(--sb-text)' }}>
        <div className="space-y-px">
          {/* Para todo mundo: o Perfil (notificações, ausência) é de cada um; o resto
              de Configurações só aparece para dono/admin (lib/configuracoes-menu.ts). */}
          <LinkDeMenu href="/configuracoes" title={recolhido ? 'Configurações' : undefined} aria-label="Configurações"
            className={cn(rodapeClasse, emConfiguracoes && 'font-semibold')}
            style={emConfiguracoes ? { background: 'var(--sb-active-bg)', color: 'var(--sb-active-text)' } : undefined}>
            <Settings size={15} strokeWidth={1.7} className="shrink-0 opacity-85" />
            {!recolhido && <span className="flex-1 truncate text-left">Configurações</span>}
          </LinkDeMenu>
          {/* Ajuda = o assistente (também no ⌘K): responde "como faço" e consulta o sistema. */}
          <button type="button" title={recolhido ? 'Ajuda' : undefined} aria-label="Ajuda" className={rodapeClasse}
            onClick={() => window.dispatchEvent(new Event('assistente:abrir'))}>
            <CircleHelp size={15} strokeWidth={1.7} className="shrink-0 opacity-85" />
            {!recolhido && <span className="flex-1 truncate text-left">Ajuda</span>}
          </button>
          <button type="button" title={recolhido ? 'Notificações' : undefined} aria-label="Notificações" className={rodapeClasse}
            onClick={() => window.dispatchEvent(new Event('notificacoes:abrir'))}>
            <Bell size={15} strokeWidth={1.7} className="shrink-0 opacity-85" />
            {!recolhido && <span className="flex-1 truncate text-left">Notificações</span>}
            {temNotificacao && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full bg-accent', recolhido && 'absolute right-1.5 top-1')} />}
          </button>
        </div>

        <div className={cn('mt-2 flex items-center gap-2.5 pt-2', recolhido ? 'flex-col px-0' : 'px-1')} style={{ borderTop: LINHA }}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white" title={recolhido ? userName : undefined}>
            {userName.slice(0, 2).toUpperCase()}
          </span>
          {!recolhido && <AusenciaPopover userName={userName} userRole={userRole} nomeClasse={strong} papelClasse={faint} />}
          <button aria-label="Sair" title="Sair" className={cn('grid h-7 w-7 place-items-center rounded-control transition-colors', HOVER)} onClick={handleLogout}>
            <LogOut size={15} strokeWidth={1.7} />
          </button>
        </div>
      </div>
    </aside>
  )
}
