import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { resolverMenu, type MenuOverridesSuperadmin, type MenuGroup } from '@/lib/menu'
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

  const mo = (emp?.menu_override ?? null) as { hidden?: string[]; labels?: Record<string, string> } | null
  const overrides: MenuOverridesSuperadmin = {
    modulos: (emp?.modulos_override ?? undefined) as MenuOverridesSuperadmin['modulos'],
    hidden: mo?.hidden,
    labels: mo?.labels,
  }
  // Menu que a empresa PODE ter (sem a camada 4 do dono) — é isso que ele gerencia.
  const grupos: MenuGroup[] = resolverMenu({
    segmento: normalizarSegmento(emp?.segmento), plano: emp?.plano ?? undefined,
    role, isSuperAdmin: false, overrides,
  })
  const cfg = (emp?.menu_config ?? null) as { hidden?: string[]; labels?: Record<string, string> } | null

  return (
    <>
      <Topbar title="Meu menu" />
      <MeuMenuView grupos={grupos} initialHidden={cfg?.hidden ?? []} initialLabels={cfg?.labels ?? {}} />
    </>
  )
}
