import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolverMenu, type MenuConfigDono } from '@/lib/menu'
import { normalizarSegmento } from '@/lib/segmentos'
import type { ModuloPlano } from '@/lib/plano'

// Rota neutra pós-login: decide o destino conforme o papel do usuário.
// Super admin → painel global; dono/admin da empresa → painel de administração;
// vendedor/técnico → dashboard operacional do tenant.
export default async function EntrarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (usuario?.is_super_admin) {
    redirect('/superadmin')
  }

  // Não é super admin: precisa de vínculo ativo com uma empresa
  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id, role')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  if (!vinculo) redirect('/register')

  // Dono/admin abrem direto no painel de administração; demais no CRM.
  if (vinculo.role === 'owner' || vinculo.role === 'admin') {
    redirect('/admin')
  }

  // Saúde: a Agenda é a tela inicial do segmento (consultas do dia).
  const { data: emp } = await supabase
    .from('empresas')
    .select('segmento, plano, permissoes, menu_config, menu_override, modulos_override')
    .eq('id', vinculo.empresa_id).maybeSingle()
  if (emp?.segmento === 'saude') redirect('/agenda')

  /**
   * A tela inicial tem de ser uma que o funcionário VÊ.
   *
   * Ia direto para /dashboard. Agora que o dono pode ocultar o Dashboard no
   * Menu do CRM, isso deixaria o vendedor começando numa tela sem link no menu
   * — escondida para todo efeito, menos justamente na hora de entrar.
   *
   * Resolve o menu com as mesmas camadas da sidebar e usa o primeiro item que
   * sobrou. Sem nenhum item visível (menu todo oculto), cai no /dashboard: é
   * melhor abrir algo do que deixar o login sem destino.
   */
  const { data: segCfg } = await supabase
    .from('segmentos_config')
    .select('hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados')
    .eq('chave', emp?.segmento ?? 'varejo').eq('ativo', true).maybeSingle()

  const mo = (emp?.menu_override ?? null) as { hidden?: string[]; labels?: Record<string, string> } | null
  const grupos = resolverMenu({
    segmento: normalizarSegmento(emp?.segmento),
    plano: emp?.plano ?? undefined,
    role: vinculo.role ?? 'vendedor',
    isSuperAdmin: false,
    overrides: {
      modulos: (emp?.modulos_override ?? undefined) as Partial<Record<ModuloPlano, boolean>> | undefined,
      hidden: mo?.hidden ?? [],
      labels: mo?.labels,
    },
    configDono: (emp?.menu_config ?? undefined) as MenuConfigDono | undefined,
    segOverride: segCfg ? {
      hiddenHrefs: (segCfg.hidden_hrefs ?? []) as string[],
      labelOverrides: (segCfg.label_overrides ?? {}) as Record<string, string>,
      modulosExtra: (segCfg.modulos_extra ?? []) as { href: string; label: string; icon: string }[],
      habilitados: (segCfg.modulos_habilitados ?? undefined) as string[] | undefined,
    } : undefined,
  })
  const primeiro = grupos.flatMap((g) => g.items).find((i) => !i.locked)?.href
  redirect(primeiro ?? '/dashboard')
}
