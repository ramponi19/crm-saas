import { createClient } from '@/lib/supabase/server'
import { FinanceiroView } from '@/components/modules/financeiro/financeiro-view'

export default async function FinanceiroPage() {
  const supabase = await createClient()
  const [{ data: lancamentos }, { data: categorias }, { data: vendasMes }] = await Promise.all([
    supabase.from('lancamentos_financeiros').select('*').order('data_venc', { ascending: false }),
    supabase.from('categorias_financeiras').select('*').order('nome'),
    supabase.from('vendas').select('valor_venda, data_venda, forma_pagamento').gte('data_venda', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ])
  return (
    <FinanceiroView
      lancamentos={lancamentos ?? []}
      categorias={categorias ?? []}
      vendasMes={vendasMes ?? []}
    />
  )
}
