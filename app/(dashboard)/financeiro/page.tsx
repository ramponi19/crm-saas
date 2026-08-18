import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import FinanceiroView from './components/financeiro-view'

export default async function FinanceiroPage() {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  /**
   * O faturamento das VENDAS entra aqui só para a tela poder AVISAR que ele não
   * está no cálculo.
   *
   * Venda concluída não gera lançamento financeiro — quem lança é a mão, o
   * orçamento por link e o webhook de pagamento. Consequência: a loja que registra
   * o aluguel e não lança as vendas vê "Resultado líquido" negativo enquanto o
   * Dashboard mostra faturamento no mesmo dia. Dois números verdadeiros que se
   * contradizem, e o dono não tem como saber qual olhar.
   *
   * A decisão de gerar receita automaticamente é de produto (risco de duplicar com
   * o lançamento manual), e está com o dono. Até lá a tela DIZ o que ela não conta,
   * em vez de deixar o número mentir sozinho.
   */
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [{ data: lancamentos }, { data: cobrancas }, { data: vendasMes }] = await Promise.all([
    supabase.from('lancamentos_financeiros').select('*').eq('empresa_id', empresaId).order('data_venc', { ascending: false }),
    supabase.from('cobrancas')
      .select('id, tipo, valor, status, descricao, created_at, link_pagamento, qr_code, linha_digitavel, vencimento, provider, os_id, venda_id, cliente_id, clientes(nome)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('vendas').select('valor_venda')
      .eq('empresa_id', empresaId).eq('status', 'concluida').gte('data_venda', inicioMes),
  ])

  const faturamentoVendas = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor_venda ?? 0), 0)

  return (
    <FinanceiroView
      lancamentos={lancamentos ?? []}
      categorias={[]}
      cobrancas={cobrancas ?? []}
      empresaId={empresaId!}
      faturamentoVendas={faturamentoVendas}
      qtdVendas={(vendasMes ?? []).length}
    />
  )
}
