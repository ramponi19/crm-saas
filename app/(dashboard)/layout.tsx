import { Sidebar } from '@/components/layout/sidebar'
import { MobileTopbar } from '@/components/layout/mobile-topbar'
import { NotificationProvider } from '@/components/layout/notification-provider'
import { ImpersonationBanner } from '@/components/superadmin/impersonation-banner'
import { AvisosBanner, type AvisoBanner } from '@/components/layout/avisos-banner'
import { LimiteBanner } from '@/components/layout/limite-banner'
import { createClient } from '@/lib/supabase/server'
import { getImpersonation } from '@/lib/supabase/server'
import { EmpresaProvider } from '@/lib/empresa-context'
import { RotulosProvider } from '@/components/layout/rotulos-context'
import { SessionGuard } from '@/components/layout/session-guard'
import { SentryUsuario } from '@/components/layout/sentry-usuario'
import { AssistenteWidget } from '@/components/assistente/assistente-widget'
import { normalizarSegmento, SEGMENTOS } from '@/lib/segmentos'
import { resolveTheme, type WlMenu } from '@/lib/wl-menu'
import type { MenuOverridesSuperadmin, MenuOverrideRow, MenuConfigDono, SegOverride } from '@/lib/menu'
import type { ModuloPlano } from '@/lib/plano'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { AvisoModuloIndisponivel } from '@/components/layout/aviso-modulo-indisponivel'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuarioRaw } = await supabase
    .from('usuarios')
    .select('nome, is_super_admin')
    .eq('id', user.id)
    .single()
  const usuario = usuarioRaw as unknown as { nome: string; is_super_admin: boolean } | null

  // Impersonação: super admin operando como uma empresa específica.
  const impersonation = await getImpersonation()

  // Resolver a empresa do contexto: impersonada (super admin) ou a do vínculo.
  let empresa: { nome: string; plano?: string | null; segmento?: string | null; wl_cor: string | null; wl_logo_url: string | null; wl_menu?: unknown; modulos_override?: unknown; menu_override?: unknown; menu_config?: unknown; permissoes?: unknown } | null = null
  let role = 'owner'
  let plano: string | undefined
  let empresaId: number | undefined

  if (impersonation) {
    // Super admin impersonando: busca os dados da empresa impersonada diretamente.
    const { data: empImp } = await supabase
      .from('empresas')
      .select('nome, plano, segmento, wl_cor, wl_logo_url, wl_menu, modulos_override, menu_override, menu_config, permissoes')
      .eq('id', impersonation.empresaId)
      .single()
    empresa = empImp ?? { nome: impersonation.nome, wl_cor: null, wl_logo_url: null }
    role = 'owner' // super admin tem controle total na empresa impersonada
    plano = empImp?.plano ?? undefined
    empresaId = impersonation.empresaId
  } else {
    // Fluxo normal: usuário precisa de vínculo com uma empresa.
    const { data: vinculo } = await supabase
      .from('empresa_usuarios')
      .select('role, empresa:empresas(id, nome, plano, segmento, wl_cor, wl_logo_url, wl_menu, modulos_override, menu_override, menu_config, permissoes)')
      .eq('usuario_id', user.id)
      .eq('ativo', true)
      .single()

    // Super admin sem vínculo e sem impersonar: mandar para o painel.
    if (!vinculo) {
      if (usuario?.is_super_admin) redirect('/superadmin')
      redirect('/register')
    }

    const vinculoTyped = vinculo as unknown as {
      role: string
      empresa: { nome: string; plano: string | null; segmento: string | null; wl_cor: string | null; wl_logo_url: string | null; wl_menu: WlMenu | null; modulos_override: unknown; menu_override: unknown; menu_config: unknown; permissoes: unknown } | null
    }
    empresa = vinculoTyped.empresa
    role = vinculoTyped.role
    plano = vinculoTyped.empresa?.plano ?? undefined
    empresaId = (vinculoTyped.empresa as { id?: number } | null)?.id
  }

  // Avisos da plataforma (banner) — filtra por alvo: todos | plano | empresa.
  const { data: avisosRaw } = await supabase
    .from('avisos_plataforma')
    .select('id, titulo, corpo, tom, alvo, alvo_valor, ativo, expira_em')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
  const avisos: AvisoBanner[] = ((avisosRaw ?? []) as Array<{
    id: number; titulo: string; corpo: string; tom: string; alvo: string; alvo_valor: string | null; expira_em: string | null
  }>)
    .filter(a => !a.expira_em || new Date(a.expira_em) > new Date())
    .filter(a =>
      a.alvo === 'todos' ||
      (a.alvo === 'plano' && a.alvo_valor === plano) ||
      (a.alvo === 'empresa' && a.alvo_valor === String(empresaId ?? ''))
    )
    .map(a => ({ id: a.id, titulo: a.titulo, corpo: a.corpo, tom: a.tom }))

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('kanban_status', 'novo')

  // Camadas 3 (override do superadmin) e 4 (config do dono) do resolverMenu.
  const mo = (empresa?.menu_override ?? null) as MenuOverrideRow | null
  // Enforcement de permissão do papel: esconde itens que o papel não pode ver.
  const perms = permsDoPapel(role, (empresa?.permissoes ?? null) as PermissoesMap | null)
  const permHidden: string[] = []
  if (!perms.verFinanceiro) permHidden.push('/financeiro')
  if (!perms.verRelatorios) permHidden.push('/relatorios')
  const menuOverrides: MenuOverridesSuperadmin = {
    modulos: (empresa?.modulos_override ?? undefined) as Partial<Record<ModuloPlano, boolean>> | undefined,
    hidden: [...(mo?.hidden ?? []), ...permHidden],
    labels: mo?.labels,
    habilitados: mo?.habilitados,
  }
  const menuConfig = (empresa?.menu_config ?? undefined) as MenuConfigDono | undefined

  // Camada 1 dinâmica: config do segmento vinda de segmentos_config (fallback = estático).
  const { data: segCfg } = await supabase
    .from('segmentos_config')
    .select('hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout')
    .eq('chave', empresa?.segmento ?? 'varejo').eq('ativo', true).maybeSingle()
  const segOverride: SegOverride | undefined = segCfg ? {
    hiddenHrefs: (segCfg.hidden_hrefs ?? []) as string[],
    labelOverrides: (segCfg.label_overrides ?? {}) as Record<string, string>,
    modulosExtra: (segCfg.modulos_extra ?? []) as { href: string; label: string; icon: string }[],
    habilitados: (segCfg.modulos_habilitados ?? undefined) as string[] | undefined,
    menuLayout: (segCfg.menu_layout ?? undefined) as Record<string, string[]> | undefined,
  } : undefined

  return (
    <EmpresaProvider>
      {/* Erro que chega sem dono custa uma investigação inteira — ver o
          componente. Fica no layout porque vale para TODAS as telas logadas. */}
      <SentryUsuario
        id={user.id}
        nome={usuario?.nome ?? 'sem nome'}
        papel={role}
        empresa={empresa?.nome}
      />
      <div className="flex h-[100dvh] overflow-hidden bg-bg">
        <Sidebar
          userName={usuario?.nome ?? user.email ?? 'Usuário'}
          /*
            "Vendedor" vira o nome que o segmento usa — "Corretor" na imobiliária.
            O ranking já chamava a mesma pessoa de corretor: sem isto, o rodapé do
            menu e a tabela do placar discordavam sobre o cargo de quem está logado.
          */
          userRole={
            role === 'owner' ? 'Proprietário'
              : role === 'admin' ? 'Administrador'
              : role === 'tecnico' ? 'Técnico'
              : (SEGMENTOS[normalizarSegmento(empresa?.segmento)].equipeLabel ?? 'Vendedor')
          }
          userEmpresa={empresa?.nome}
          leadsCount={leadsCount ?? 0}
          empresaLogo={empresa?.wl_logo_url ?? null}
          isSuperAdmin={usuario?.is_super_admin ?? false}
          role={role}
          plano={plano}
          segmento={normalizarSegmento(empresa?.segmento)}
          theme={resolveTheme(empresa?.wl_menu as WlMenu | null, empresa?.wl_cor)}
          overrides={menuOverrides}
          configDono={menuConfig}
          segOverride={segOverride}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Cabeçalho mobile: ☰ no canto abre o menu completo em gaveta (só no celular). */}
          <MobileTopbar
            empresaNome={empresa?.nome}
            empresaLogo={empresa?.wl_logo_url ?? null}
            userName={usuario?.nome ?? user.email ?? 'Usuário'}
            segmento={normalizarSegmento(empresa?.segmento)}
            plano={plano}
            role={role}
            isSuperAdmin={usuario?.is_super_admin ?? false}
            leadsCount={leadsCount ?? 0}
            overrides={menuOverrides}
            configDono={menuConfig}
            segOverride={segOverride}
          />
          <Suspense fallback={null}><AvisoModuloIndisponivel /></Suspense>
          {impersonation && <ImpersonationBanner empresaNome={impersonation.nome} />}
          {avisos.length > 0 && <AvisosBanner avisos={avisos} />}
          <LimiteBanner />
          {/*
            Os rótulos do segmento chegam à barra do topo de cada tela.
            Mesma precedência do menu: segmento, depois superadmin, depois o dono —
            senão o menu diria "Pipeline" e o topo da mesma página, "Leads".
          */}
          <RotulosProvider valor={{ ...(segOverride?.labelOverrides ?? {}), ...(mo?.labels ?? {}), ...(menuConfig?.labels ?? {}) }}>
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
          </RotulosProvider>
        </div>
      </div>
      <NotificationProvider empresaNome={empresa?.nome ? `${empresa.nome} — CRM` : undefined} />
      <SessionGuard />
      <AssistenteWidget />
    </EmpresaProvider>
  )
}
