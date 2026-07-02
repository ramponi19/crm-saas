import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizarSegmento } from '@/lib/segmentos'
import { getOrCreatePortalToken } from '@/lib/portal-token'
import ImoveisView from './imoveis-view'

export const metadata = { title: 'Imóveis' }

export default async function ImoveisPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: empresa } = await supabase.from('empresas').select('segmento, slug').eq('id', empresaId).single()
  if (normalizarSegmento(empresa?.segmento) !== 'imobiliaria') redirect('/dashboard')

  const [{ data: imoveis }, { data: proprietarios }] = await Promise.all([
    supabase.from('imoveis').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    supabase.from('proprietarios').select('id, nome').eq('empresa_id', empresaId).order('nome'),
  ])

  // token do webhook de leads dos portais (gerado sob demanda)
  const leadsToken = await getOrCreatePortalToken(createServiceClient(), empresaId)

  return (
    <ImoveisView
      inicial={imoveis ?? []}
      proprietarios={proprietarios ?? []}
      empresaId={empresaId}
      slug={empresa?.slug ?? ''}
      leadsToken={leadsToken}
    />
  )
}
