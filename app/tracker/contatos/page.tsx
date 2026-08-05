import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { ContatosView, type Contato } from '@/components/tracker/contatos-view'

export const metadata = { title: 'Contatos · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function ContatosPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  const [{ data: leads }, { data: etapas }] = await Promise.all([
    db.from('leads')
      .select('id, nome, telefone, foto_url, origem, kanban_status, valor_estimado, produto_interessado, created_at')
      .eq('empresa_id', empresaId).eq('ativo', true)
      .order('created_at', { ascending: false }).limit(1000),
    db.from('funil_etapas').select('slug, label').eq('empresa_id', empresaId),
  ])

  const etapaLabels: Record<string, string> = {}
  for (const e of (etapas ?? []) as { slug: string; label: string }[]) etapaLabels[e.slug] = e.label

  const contatos: Contato[] = ((leads ?? []) as Array<{
    id: number; nome: string | null; telefone: string | null; foto_url: string | null
    origem: string | null; kanban_status: string | null; valor_estimado: number | null; produto_interessado: string | null; created_at: string | null
  }>).map((l) => ({
    id: l.id, nome: l.nome || l.telefone || 'Sem nome', telefone: l.telefone, foto_url: l.foto_url,
    origem: l.origem, etapa: l.kanban_status, valor: l.valor_estimado != null ? Number(l.valor_estimado) : null,
    produto: l.produto_interessado, criado: l.created_at,
  }))

  return <div className="h-full min-h-0"><ContatosView contatos={contatos} etapaLabels={etapaLabels} /></div>
}
