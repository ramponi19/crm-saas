import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
import ProprietariosView from './proprietarios-view'

export const metadata = { title: 'Proprietários' }

export default async function ProprietariosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  // módulo exclusivo do segmento imobiliária
  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).single()
  if (normalizarSegmento(empresa?.segmento) !== 'imobiliaria') redirect('/dashboard')

  const { data } = await supabase
    .from('proprietarios')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome')

  return <ProprietariosView inicial={data ?? []} empresaId={empresaId} />
}
