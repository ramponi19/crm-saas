import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizarSegmento } from '@/lib/segmentos'
import SiteView from './site-view'

async function getSite(slug: string) {
  const svc = createServiceClient()
  const { data: empresa } = await svc
    .from('empresas')
    .select('id, nome, segmento, wl_cor, wl_logo_url, wl_slogan, wl_whatsapp, telefone')
    .eq('slug', slug)
    .maybeSingle()
  if (!empresa) return null

  const { data: imoveis } = await svc
    .from('imoveis')
    .select('id, codigo, titulo, tipo, finalidade, status, bairro, cidade, uf, valor_venda, valor_locacao, quartos, banheiros, vagas, area_util, fotos')
    .eq('empresa_id', empresa.id)
    .eq('status', 'disponivel')
    .order('created_at', { ascending: false })

  return { empresa, imoveis: imoveis ?? [] }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getSite(slug)
  if (!data) return { title: 'Imobiliária não encontrada' }
  return { title: `${data.empresa.nome} — Imóveis`, description: data.empresa.wl_slogan ?? `Imóveis disponíveis na ${data.empresa.nome}` }
}

export default async function SitePublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getSite(slug)
  if (!data) notFound()
  // Site imobiliário é do segmento imobiliária
  if (normalizarSegmento(data.empresa.segmento) !== 'imobiliaria') notFound()

  return <SiteView empresa={data.empresa} imoveis={data.imoveis} />
}
