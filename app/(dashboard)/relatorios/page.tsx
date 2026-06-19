import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { RelatoriosView } from '@/components/modules/relatorios/relatorios-view'

export const metadata = { title: 'Relatórios' }

async function getRelatoriosData() {
  const supabase = await createClient()

  const hoje = new Date()
  const ano = hoje.getFullYear()
  const inicioAno = `${ano}-01-01`
  const fimAno    = `${ano}-12-31`

  const [vendasRes, lancamentosRes, leadsPorStatusRes, estoqueRes, osRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('valor_venda, data_venda, forma_pagamento, canal_venda, status, lucro_bruto')
      .gte('data_venda', inicioAno)
      .lte('data_venda', fimAno)
      .eq('status', 'concluida'),

    supabase
      .from('lancamentos_financeiros')
      .select('tipo, valor, data_venc, status, categoria')
      .gte('data_venc', inicioAno)
      .lte('data_venc', fimAno),

    supabase
      .from('leads')
      .select('status, created_at'),

    supabase
      .from('estoque')
      .select('preco_venda, preco_custo, status')
      .eq('status', 'disponivel'),

    supabase
      .from('ordens_servico')
      .select('orcamento_valor, status, data_entrada')
      .gte('data_entrada', inicioAno),
  ])

  return {
    vendas: vendasRes.data ?? [],
    lancamentos: lancamentosRes.data ?? [],
    leads: leadsPorStatusRes.data ?? [],
    estoque: estoqueRes.data ?? [],
    ordensServico: osRes.data ?? [],
  }
}

export default async function RelatoriosPage() {
  const data = await getRelatoriosData()

  return (
    <div className="flex flex-col h-full">
      <Topbar eyebrow="ANALYTICS" title="Relatórios / BI" />
      <div className="flex-1 overflow-auto">
        <RelatoriosView {...data} />
      </div>
    </div>
  )
}
