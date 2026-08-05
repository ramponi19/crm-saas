import { rastrDb } from '@/lib/rastreamento/db'

/**
 * "Leads (detalhe)" do módulo Rastreamento — classifica cada lead por ORIGEM,
 * espelhando a taxonomia do Tracker Ads:
 *   metalead  → Meta Lead Ads (formulário do anúncio)
 *   ctwa      → Click-to-WhatsApp (anúncio que abre o WhatsApp)
 *   lp        → Landing Page (visita com pixel, sem link do Tracker)
 *   link      → Link rastreável (visita veio de um link criado no Tracker)
 *   outros    → sem atribuição
 *
 * Cruza `leads` com `rastreamento_visitas` (dados reais). Meta Lead Ads/CTWA
 * dependem da conexão Meta para precisão total — aqui inferimos pela origem.
 */
export type OrigemBucket = 'metalead' | 'ctwa' | 'lp' | 'link' | 'outros'

export const ORIGEM_LABEL: Record<OrigemBucket, string> = {
  metalead: 'Meta Lead Ads', ctwa: 'Tracker Ads (CTWA)', lp: 'Landing Page', link: 'Link rastreável', outros: 'Outros',
}

export interface LeadDetalhe {
  id: number; nome: string; telefone: string | null; bucket: OrigemBucket
  campanha: string | null; criado: string | null
}

export interface RastreamentoDetalhe {
  total: number
  contagem: Record<OrigemBucket, number>
  leads: LeadDetalhe[]
}

export async function calcularLeadsDetalhe(empresaId: number, dias = 30): Promise<RastreamentoDetalhe> {
  const db = rastrDb()
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const [{ data: leads }, { data: visitas }] = await Promise.all([
    db.from('leads').select('id, nome, telefone, origem, created_at').eq('empresa_id', empresaId).eq('ativo', true).gte('created_at', desde).limit(2000),
    db.from('rastreamento_visitas').select('lead_id, link_id, page_url, utm_campaign, utm_source').eq('empresa_id', empresaId).not('lead_id', 'is', null).limit(4000),
  ])

  type V = { lead_id: number; link_id: number | null; page_url: string | null; utm_campaign: string | null; utm_source: string | null }
  const porLead = new Map<number, V>()
  for (const v of (visitas ?? []) as V[]) if (!porLead.has(v.lead_id)) porLead.set(v.lead_id, v)

  const contagem: Record<OrigemBucket, number> = { metalead: 0, ctwa: 0, lp: 0, link: 0, outros: 0 }
  const out: LeadDetalhe[] = []

  for (const l of (leads ?? []) as { id: number; nome: string | null; telefone: string | null; origem: string | null; created_at: string | null }[]) {
    const v = porLead.get(l.id)
    const origem = (l.origem || '').toLowerCase()
    let bucket: OrigemBucket
    let campanha: string | null = v?.utm_campaign ?? null
    if (v?.link_id != null) bucket = 'link'
    else if (v?.page_url) bucket = 'lp'
    else if (origem.startsWith('ads:') || origem.includes('ctwa') || origem.includes('whatsapp_ad')) { bucket = 'ctwa'; campanha = campanha ?? origem.replace(/^ads:/, '') }
    else if (origem.includes('lead_ads') || origem.includes('meta_lead')) bucket = 'metalead'
    else bucket = 'outros'
    contagem[bucket]++
    out.push({ id: l.id, nome: l.nome || l.telefone || 'Sem nome', telefone: l.telefone, bucket, campanha, criado: l.created_at })
  }

  return { total: out.length, contagem, leads: out.sort((a, b) => (b.criado ?? '').localeCompare(a.criado ?? '')) }
}
