import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { resolverMenuPlano, donoPodeOcultar, type MenuItem } from '@/lib/menu'
import { carregarConfigEmpresa, camadasParaMenu } from '@/lib/empresa-config'
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
    supabase.from('empresas').select('segmento:preset_onboarding, preset_onboarding, plano').eq('id', empresaId).single(),
  ])
  const role = vinculo?.role ?? 'owner'
  const isAdmin = usuario?.is_super_admin || role === 'owner' || role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  /**
   * A CONFIG DO SEGMENTO precisa entrar aqui também — senão esta tela lista itens
   * que o segmento desligou e não lista os que ele acrescenta ("Metas e Ranking"
   * da imobiliária sumia daqui). Desde 21/10/2026 vem do core, como o menu:
   * lib/empresa-config.ts.
   */
  const camadas = await carregarConfigEmpresa(supabase, empresaId, emp?.preset_onboarding ?? null)
  const { overrides, segOverride } = camadasParaMenu(camadas)
  const cfg = camadas.dono ?? null

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
