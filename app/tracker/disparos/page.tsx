import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { DisparosView, type Campanha } from '@/components/tracker/disparos-view'

export const metadata = { title: 'Disparos · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function DisparosPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  const [{ data: campanhas }, { data: etapas }, { data: leadsOrigem }, { data: canaisRaw }] = await Promise.all([
    db.from('tracker_disparo').select('id, nome, status, mensagem, publico_tipo, publico_valor, total_alvos, enviados, agendado_para, criado_em').eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(100),
    db.from('funil_etapas').select('slug, label').eq('empresa_id', empresaId).eq('ativo', true).order('ordem', { ascending: true }),
    db.from('leads').select('origem').eq('empresa_id', empresaId).eq('ativo', true).limit(1000),
    db.from('canais_conectados').select('nome_exibicao, tipo, external_id').eq('empresa_id', empresaId).eq('tipo', 'whatsapp'),
  ])

  const origens = [...new Set(((leadsOrigem ?? []) as { origem: string | null }[]).map((l) => l.origem || 'manual'))].sort()
  const canais = ((canaisRaw ?? []) as { nome_exibicao: string | null; external_id: string }[]).map((c) => c.nome_exibicao || c.external_id || 'WhatsApp')

  // Dedup por slug (múltiplos funis repetem os mesmos slugs de etapa).
  const vistos = new Set<string>()
  const etapasUnicas = ((etapas ?? []) as { slug: string; label: string }[]).filter((e) => (vistos.has(e.slug) ? false : (vistos.add(e.slug), true)))

  return (
    <DisparosView
      iniciais={(campanhas ?? []) as Campanha[]}
      etapas={etapasUnicas}
      origens={origens}
      canais={canais}
    />
  )
}
