import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
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

  return (
    <ImoveisView
      inicial={imoveis ?? []}
      proprietarios={proprietarios ?? []}
      empresaId={empresaId}
      slug={empresa?.slug ?? ''}
    />
  )
}
