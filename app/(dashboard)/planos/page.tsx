import { createClient, getEmpresaId } from '@/lib/supabase/server'
import PlanosView from './planos-view'

export default async function PlanosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: empresa }, { data: planos }] = await Promise.all([
    supabase.from('empresas').select('plano, trial_ends_at, stripe_customer_id').eq('id', empresaId).single(),
    supabase.from('planos_config').select('*').eq('ativo', true).order('ordem'),
  ])

  return <PlanosView empresa={empresa} planos={planos ?? []} />
}
