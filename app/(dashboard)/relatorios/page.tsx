import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { RelatoriosView } from '@/components/modules/relatorios/relatorios-view'

export const metadata = { title: 'Relatórios' }

export default async function RelatoriosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [
    { data: vendasRaw },
    { data: lancamentos },
    { data: vendedoresRaw },
  ] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, data_venda, valor_venda, desconto_valor, lucro, forma_pagamento, canal_venda, status, clientes!cliente_id(nome), produtos!produto_id(nome), usuarios!vendedor_id(nome)')
      .eq('empresa_id', empresaId)
      .order('data_venda', { ascending: false })
      .limit(500),
    supabase
      .from('lancamentos_financeiros')
      .select('id, data_venc, descricao, categoria, tipo, valor, status')
      .eq('empresa_id', empresaId)
      .order('data_venc', { ascending: false })
      .limit(200),
    supabase
      .from('empresa_usuarios')
      .select('usuarios!usuario_id(nome)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
  ])

  const vendas = (vendasRaw ?? []).map((v: any) => ({
    ...v,
    cliente_nome:  v.clientes?.nome ?? null,
    produto_nome:  v.produtos?.nome ?? null,
    vendedor_nome: v.usuarios?.nome ?? null,
  }))

  // Deduplica e filtra nulos
  const vendedores = [...new Set(
    (vendedoresRaw ?? []).map((eu: any) => eu.usuarios?.nome as string).filter(Boolean)
  )]

  return (
    <>
      <Topbar eyebrow="ANÁLISE" title="Relatórios" />
      <RelatoriosView
        vendas={vendas}
        lancamentos={lancamentos ?? []}
        vendedores={vendedores}
      />
    </>
  )
}
