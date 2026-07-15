import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { PropostasView, type Proposta } from './propostas-view'

export const metadata = { title: 'Propostas' }

export default async function PropostasPage() {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data } = await supabase
    .from('propostas')
    .select('id, cliente_nome, itens, observacoes, total, status, token, created_at')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })

  const base = process.env.NEXT_PUBLIC_APP_URL || ''

  return (
    <>
      <Topbar title="Propostas" />
      <PropostasView initial={(data ?? []) as unknown as Proposta[]} baseUrl={base} />
    </>
  )
}
