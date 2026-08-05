import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { Pipeline, type Etapa, type CardLead } from '@/components/tracker/pipeline'

export const metadata = { title: 'CRM · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function CrmPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  // Funil padrão (ou o primeiro).
  const { data: funis } = await db.from('funis')
    .select('id, nome, padrao').eq('empresa_id', empresaId).order('padrao', { ascending: false }).order('id', { ascending: true })
  const funil = (funis ?? [])[0] as { id: number; nome: string } | undefined

  let etapas: Etapa[] = []
  if (funil) {
    const { data: es } = await db.from('funil_etapas')
      .select('slug, label, cor, ordem, tipo').eq('empresa_id', empresaId).eq('funil_id', funil.id).eq('ativo', true)
      .order('ordem', { ascending: true })
    etapas = (es ?? []) as Etapa[]
  }

  const { data: leadsRaw } = await db.from('leads')
    .select('id, nome, telefone, foto_url, valor_estimado, kanban_status, produto_interessado, origem')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .order('kanban_ordem', { ascending: true, nullsFirst: false })
    .limit(500)

  const leads: CardLead[] = ((leadsRaw ?? []) as Array<{
    id: number; nome: string | null; telefone: string | null; foto_url: string | null
    valor_estimado: number | null; kanban_status: string | null; produto_interessado: string | null; origem: string | null
  }>).map((l) => ({
    id: l.id, nome: l.nome || l.telefone || 'Sem nome', telefone: l.telefone, foto_url: l.foto_url,
    valor: l.valor_estimado != null ? Number(l.valor_estimado) : null,
    etapa: l.kanban_status || (etapas[0]?.slug ?? 'novo'),
    produto: l.produto_interessado, origem: l.origem,
  }))

  return <Pipeline funilNome={funil?.nome ?? 'Pipeline'} funilId={funil?.id ?? null} etapas={etapas} leadsIniciais={leads} />
}
