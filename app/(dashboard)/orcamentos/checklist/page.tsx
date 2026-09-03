import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'
import { ChecklistView } from './checklist-view'

export const metadata = { title: 'Checklist de avaliação' }

export default async function ChecklistPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!empresaId) redirect('/dashboard')
  if (!(await cotacaoDeTrocaLiberada())) redirect('/orcamentos')

  // O corte de bateria é a única coisa que o roteiro precisa do banco: o item 6
  // manda comparar com "o corte da sua loja", e sem o número o vendedor decide
  // de cabeça.
  const { data: regras } = await supabase.from('troca_regras')
    .select('corte_bateria').eq('empresa_id', empresaId).maybeSingle()

  return <ChecklistView corteBateria={regras?.corte_bateria ?? 80} />
}
