import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { resolverMenuPlano, type MenuOverridesSuperadmin, type MenuOverrideRow, type MenuItem, type SegOverride } from '@/lib/menu'
import { normalizarSegmento } from '@/lib/segmentos'
import { MeuMenuView } from './meu-menu-view'

export const metadata = { title: 'Meu menu' }

export default async function MeuMenuPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  const [{ data: vinculo }, { data: usuario }, { data: emp }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
    supabase.from('empresas').select('segmento, plano, modulos_override, menu_override, menu_config').eq('id', empresaId).single(),
  ])
  const role = vinculo?.role ?? 'owner'
  const isAdmin = usuario?.is_super_admin || role === 'owner' || role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  const mo = (emp?.menu_override ?? null) as MenuOverrideRow | null
  const overrides: MenuOverridesSuperadmin = {
    modulos: (emp?.modulos_override ?? undefined) as MenuOverridesSuperadmin['modulos'],
    hidden: mo?.hidden,
    labels: mo?.labels,
    habilitados: mo?.habilitados,
  }

  /**
   * A CONFIG DO SEGMENTO precisa entrar aqui também.
   *
   * Esta tela resolvia o menu sem consultar `segmentos_config`, então listava itens
   * que o segmento desligou e — pior — não listava os que ele acrescenta. Na
   * imobiliária isso significava que "Metas e Ranking" simplesmente não existia
   * para o dono ocultar, renomear ou reordenar: a tela de ajuste do menu discordava
   * do menu.
   */
  const { data: segCfg } = await supabase
    .from('segmentos_config')
    .select('hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout')
    .eq('chave', emp?.segmento ?? 'varejo').eq('ativo', true).maybeSingle()
  const segOverride: SegOverride | undefined = segCfg ? {
    hiddenHrefs: (segCfg.hidden_hrefs ?? []) as string[],
    labelOverrides: (segCfg.label_overrides ?? {}) as Record<string, string>,
    modulosExtra: (segCfg.modulos_extra ?? []) as { href: string; label: string; icon: string }[],
    habilitados: (segCfg.modulos_habilitados ?? undefined) as string[] | undefined,
    menuLayout: (segCfg.menu_layout ?? undefined) as Record<string, string[]> | undefined,
  } : undefined

  const cfg = (emp?.menu_config ?? null) as {
    hidden?: string[]; labels?: Record<string, string>; ordem?: Record<string, string[]>
  } | null

  /**
   * Menu que a empresa PODE ter — com a ORDEM do dono já aplicada, mas sem o que ele
   * ocultou: item escondido tem de aparecer nesta lista, senão não há como
   * reexibi-lo. Por isso `configDono` entra só com a ordem.
   */
  const itens: MenuItem[] = resolverMenuPlano({
    segmento: normalizarSegmento(emp?.segmento), plano: emp?.plano ?? undefined,
    role, isSuperAdmin: false, overrides, segOverride,
    configDono: { ordem: cfg?.ordem },
  })

  return (
    <>
      <Topbar title="Meu menu" />
      <MeuMenuView itens={itens} initialHidden={cfg?.hidden ?? []} initialLabels={cfg?.labels ?? {}} />
    </>
  )
}
