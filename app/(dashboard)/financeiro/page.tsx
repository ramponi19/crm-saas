import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { FinanceiroView } from '@/components/modules/financeiro/financeiro-view'

export const metadata = { title: 'Financeiro' }

async function getFinanceiroData() {
  const supabase = await createClient()

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  const inicioPrev = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  inicioPrev.setMonth(inicioPrev.getMonth() - 1)
  const inicioPrevStr = inicioPrev.toISOString().split('T')[0]

  // Lançamentos do mês + próximos 30 dias
  const dataFim = new Date(hoje)
  dataFim.setDate(dataFim.getDate() + 30)

  const [lancamentosRes, categoriasRes, vendasMesRes] = await Promise.all([
    supabase
      .from('lancamentos_financeiros')
      .select('*')
      .gte('data_venc', inicioPrevStr)
      .lte('data_venc', dataFim.toISOString().split('T')[0])
      .order('data_venc', { ascending: false }),

    supabase
      .from('categorias_financeiras')
      .select('*')
      .order('nome'),

    supabase
      .from('vendas')
      .select('valor_venda, data_venda, forma_pagamento')
      .gte('data_venda', inicioMes)
      .lte('data_venda', fimMes)
      .eq('status', 'concluida'),
  ])

  return {
    lancamentos: lancamentosRes.data ?? [],
    categorias: categoriasRes.data ?? [],
    vendasMes: vendasMesRes.data ?? [],
  }
}

export default async function FinanceiroPage() {
  const data = await getFinanceiroData()

  return (
    <div className="flex flex-col h-full">
      <Topbar eyebrow="CAIXA & CONTAS" title="Financeiro" showPeriods />
      <div className="flex-1 overflow-auto">
        <FinanceiroView {...data} />
      </div>
    </div>
  )
}
