import { requireSuperAdmin } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { getImpersonation } from '@/lib/supabase/server'
import { CATALOGO, statusDo } from '@/lib/menu'
import { LaboratorioView, type ItemLab } from './laboratorio-view'

export const metadata = { title: 'Laboratório' }

const PREVIEW_SLUG = '__preview__'

export default async function LaboratorioPage() {
  await requireSuperAdmin()
  const svc = createServiceClient()

  // Em quantos segmentos cada href está ligado — mostra de relance o que já foi
  // liberado e o que ainda não saiu do catálogo.
  const { data: segs } = await svc.from('segmentos_config').select('modulos_habilitados')
  const contagem = new Map<string, number>()
  for (const s of segs ?? []) {
    for (const href of ((s.modulos_habilitados ?? []) as string[])) {
      contagem.set(href, (contagem.get(href) ?? 0) + 1)
    }
  }

  const itens: ItemLab[] = CATALOGO.flatMap((g) =>
    g.items.map((i) => ({
      href: i.href,
      label: i.label,
      icon: i.icon,
      grupo: g.label,
      status: statusDo(i),
      segmentos: contagem.get(i.href) ?? 0,
    })),
  )

  // Está no laboratório? = impersonando a empresa de preview.
  const imp = await getImpersonation()
  const { data: preview } = await svc.from('empresas').select('id, nome').eq('slug', PREVIEW_SLUG).maybeSingle()
  const emPreview = !!imp && !!preview && imp.empresaId === preview.id

  return <LaboratorioView itens={itens} emPreview={emPreview} empresaPreview={preview?.nome ?? null} />
}
