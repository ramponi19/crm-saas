import { createClient } from '@/lib/supabase/server'
import FinanceiroView from './components/financeiro-view'

export default async function FinanceiroPage() {
  const supabase = await createClient()
  const { data: lancamentos } = await supabase
    .from('lancamentos_financeiros')
    .select('*')
    .order('data_venc', { ascending: false })
  return <FinanceiroView lancamentos={lancamentos ?? []} />
}
