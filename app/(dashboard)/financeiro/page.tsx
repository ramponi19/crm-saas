import { createClient, getEmpresaId } from '@/lib/supabase/server'
import FinanceiroView from './components/financeiro-view'

export default async function FinanceiroPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const [{ data: lancamentos }, { data: categorias }] = await Promise.all([
    supabase.from('lancamentos_financeiros').select('*').eq('empresa_id', empresaId).order('data_venc', { ascending: false }),
    supabase.from('categorias_financeiras').select('*').eq('empresa_id', empresaId).order('nome'),
  ])
  return <FinanceiroView lancamentos={lancamentos ?? []} categorias={categorias ?? []} />
}
