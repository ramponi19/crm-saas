import { createClient } from '@/lib/supabase/server'
import FinanceiroView from './components/financeiro-view'

export default async function FinanceiroPage() {
  const supabase = await createClient()
  const [{ data: lancamentos }, { data: categorias }] = await Promise.all([
    supabase.from('lancamentos_financeiros').select('*').order('data_venc', { ascending: false }),
    supabase.from('categorias_financeiras').select('*').order('nome'),
  ])
  return <FinanceiroView lancamentos={lancamentos ?? []} categorias={categorias ?? []} />
}
