import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import PlanosView from './planos-view'

export default async function PlanosPage() {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: empresa }, { data: planos }] = await Promise.all([
    supabase.from('empresas').select('plano, trial_ends_at, stripe_customer_id').eq('id', empresaId).single(),
    supabase.from('planos_config').select('*').eq('ativo', true).order('ordem'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PlanosView empresa={empresa} planos={(planos ?? []) as any} />
}
