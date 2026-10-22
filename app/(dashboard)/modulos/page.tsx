import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getEmpresaRole } from '@/lib/owner'
import { carregarConfigEmpresa, camadasParaMenu } from '@/lib/empresa-config'
import { CATALOGO, hrefsHabilitados } from '@/lib/menu'
import { tilesDaCentral } from '@/lib/modulos-central'
import { normalizarSegmento } from '@/lib/segmentos'
import { Topbar } from '@/components/layout/topbar'
import { CentralModulos } from '@/components/modulos/central-modulos'

export const metadata = { title: 'Central de módulos' }

/**
 * CENTRAL DE MÓDULOS (22/10/2026) — a seção 5 do 02-COMPARACAO-E-PLANO.md.
 *
 * Uma grade com um tile por módulo do manifesto (core/modulos.ts): o que faz, o
 * estado nesta empresa e, para dono e admin, o botão. Fora de /configuracoes de
 * propósito: a equipe também abre (vê a grade, sem botões); o dono chega por
 * Configurações › Área de trabalho e pelo ⌘K.
 *
 * Lê só tabelas do core: empresas, presets_onboarding, empresa_menu,
 * empresa_modulos e modulo_pedidos — nenhuma view de compatibilidade.
 */
export default async function ModulosPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m: destaque } = await searchParams
  const [supabase, empresaId, papel] = await Promise.all([createClient(), getEmpresaId(), getEmpresaRole()])
  if (!empresaId || !papel) redirect('/login')

  const [{ data: empresa }, { data: pedidosRaw }] = await Promise.all([
    supabase.from('empresas').select('plano, preset_onboarding').eq('id', empresaId).maybeSingle(),
    // Pedidos só pela chave de serviço (RLS fechada), filtrados pela empresa da sessão.
    createServiceClient().from('modulo_pedidos').select('modulo, pedido_em')
      .eq('empresa_id', empresaId).is('atendido_em', null),
  ])
  const cfg = await carregarConfigEmpresa(supabase, empresaId, empresa?.preset_onboarding ?? null)
  const { overrides, segOverride, instalados } = camadasParaMenu(cfg)

  const tiles = tilesDaCentral({
    ligados: hrefsHabilitados({ segmento: normalizarSegmento(empresa?.preset_onboarding), overrides, segOverride, instalados }),
    plano: empresa?.plano ?? undefined,
    forcados: cfg.forcados,
    ativos: new Set(cfg.modulos.filter((r) => r.ativo).map((r) => r.modulo)),
    pedidos: Object.fromEntries((pedidosRaw ?? []).map((p) => [p.modulo, p.pedido_em])),
  })

  // O ícone do tile é o do item no menu (o ZapIntel não é item: raio).
  const iconeDoMenu = new Map(CATALOGO.flatMap((g) => g.items).map((i) => [i.href, i.icon]))
  const comIcone = tiles.map((t) => ({ ...t, icone: iconeDoMenu.get(t.href) ?? 'Zap' }))

  return (
    <>
      <Topbar title="Central de módulos" />
      <CentralModulos tiles={comIcone} podeMudar={papel === 'owner' || papel === 'admin'} destaque={destaque ?? null} />
    </>
  )
}
