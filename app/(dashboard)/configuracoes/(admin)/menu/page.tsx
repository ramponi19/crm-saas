import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { resolverMenuPlano, donoPodeOcultar, type MenuItem } from '@/lib/menu'
import { carregarConfigEmpresa, entradaDoMenu } from '@/lib/empresa-config'
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
    supabase.from('empresas').select('preset_onboarding, plano').eq('id', empresaId).single(),
  ])
  const role = vinculo?.role ?? 'owner'
  const isAdmin = usuario?.is_super_admin || role === 'owner' || role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  /**
   * As MESMAS camadas do menu entram aqui (preset, superadmin, Central de Módulos)
   * — senão esta tela lista itens que a empresa não tem e esquece os que ela ganhou
   * ("Metas e Ranking" da imobiliária sumia daqui). Montadas por
   * lib/empresa-config.ts (`entradaDoMenu`), que é quem lê o preset.
   */
  const camadas = await carregarConfigEmpresa(supabase, empresaId, emp?.preset_onboarding ?? null)
  const cfg = camadas.dono ?? null

  /**
   * Menu que a empresa PODE ter — com a ORDEM do dono já aplicada, mas sem o que ele
   * ocultou: item escondido tem de aparecer nesta lista, senão não há como
   * reexibi-lo. Por isso `configDono` entra só com a ordem.
   */
  const itens: MenuItem[] = resolverMenuPlano({
    ...entradaDoMenu(camadas, { plano: emp?.plano ?? undefined, role, isSuperAdmin: false }),
    configDono: { ordem: cfg?.ordem },
  })
    // O que veio do /admin (Insights e Automações de gestão) o dono não oculta: a
    // tela não oferece um botão que não faria nada (lib/menu.ts, `donoNaoOculta`).
    .filter((i) => donoPodeOcultar(i.href))

  return (
    <>
      <Topbar title="Meu menu" />
      <MeuMenuView itens={itens} initialHidden={cfg?.hidden ?? []} initialLabels={cfg?.labels ?? {}} />
    </>
  )
}
