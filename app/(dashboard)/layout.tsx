import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { NotificationProvider } from '@/components/layout/notification-provider'
import { ImpersonationBanner } from '@/components/superadmin/impersonation-banner'
import { LimiteBanner } from '@/components/layout/limite-banner'
import { createClient } from '@/lib/supabase/server'
import { getImpersonation } from '@/lib/supabase/server'
import { EmpresaProvider } from '@/lib/empresa-context'
import { SessionGuard } from '@/components/layout/session-guard'
import { normalizarSegmento } from '@/lib/segmentos'
import { resolveTheme, type WlMenu } from '@/lib/wl-menu'
import type { MenuOverridesSuperadmin, MenuConfigDono, SegOverride } from '@/lib/menu'
import type { ModuloPlano } from '@/lib/plano'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { redirect } from 'next/navigation'

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

  if (impersonation) {
    // Super admin impersonando: busca os dados da empresa impersonada diretamente.
    const { data: empImp } = await supabase
      .from('empresas')
      .select('nome, segmento, wl_cor, wl_logo_url, wl_menu, modulos_override, menu_override, menu_config, permissoes')
      .eq('id', impersonation.empresaId)
      .single()
    empresa = empImp ?? { nome: impersonation.nome, wl_cor: null, wl_logo_url: null }
    role = 'owner' // super admin tem controle total na empresa impersonada
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
  }

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('kanban_status', 'novo')

  // Camadas 3 (override do superadmin) e 4 (config do dono) do resolverMenu.
  const mo = (empresa?.menu_override ?? null) as { hidden?: string[]; labels?: Record<string, string> } | null
  // Enforcement de permissão do papel: esconde itens que o papel não pode ver.
  const perms = permsDoPapel(role, (empresa?.permissoes ?? null) as PermissoesMap | null)
  const permHidden: string[] = []
  if (!perms.verFinanceiro) permHidden.push('/financeiro')
  if (!perms.verRelatorios) permHidden.push('/relatorios')
  const menuOverrides: MenuOverridesSuperadmin = {
    modulos: (empresa?.modulos_override ?? undefined) as Partial<Record<ModuloPlano, boolean>> | undefined,
    hidden: [...(mo?.hidden ?? []), ...permHidden],
    labels: mo?.labels,
  }
  const menuConfig = (empresa?.menu_config ?? undefined) as MenuConfigDono | undefined

  // Camada 1 dinâmica: config do segmento vinda de segmentos_config (fallback = estático).
  const { data: segCfg } = await supabase
    .from('segmentos_config')
    .select('hidden_hrefs, label_overrides, modulos_extra')
    .eq('chave', empresa?.segmento ?? 'varejo').eq('ativo', true).maybeSingle()
  const segOverride: SegOverride | undefined = segCfg ? {
    hiddenHrefs: (segCfg.hidden_hrefs ?? []) as string[],
    labelOverrides: (segCfg.label_overrides ?? {}) as Record<string, string>,
    modulosExtra: (segCfg.modulos_extra ?? []) as { href: string; label: string; icon: string }[],
  } : undefined

  return (
    <EmpresaProvider>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar
          userName={usuario?.nome ?? user.email ?? 'Usuário'}
          userRole={
            role === 'owner' ? 'Proprietário'
              : role === 'admin' ? 'Administrador'
              : role === 'tecnico' ? 'Técnico'
              : 'Vendedor'
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
          {impersonation && <ImpersonationBanner empresaNome={impersonation.nome} />}
          <LimiteBanner />
          {children}
          <BottomNav
            segmento={normalizarSegmento(empresa?.segmento)}
            plano={plano}
            role={role}
            isSuperAdmin={usuario?.is_super_admin ?? false}
            leadsCount={leadsCount ?? 0}
            overrides={menuOverrides}
            configDono={menuConfig}
            segOverride={segOverride}
          />
        </div>
      </div>
      <NotificationProvider empresaNome={empresa?.nome ? `${empresa.nome} — CRM` : undefined} />
      <SessionGuard />
    </EmpresaProvider>
  )
}
