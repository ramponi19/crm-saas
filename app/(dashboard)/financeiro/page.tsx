import { createClient, getEmpresaId } from '@/lib/supabase/server'
import FinanceiroView from './components/financeiro-view'

export default async function FinanceiroPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const [{ data: lancamentos }, { data: categorias }, { data: cobrancas }] = await Promise.all([
    supabase.from('lancamentos_financeiros').select('*').eq('empresa_id', empresaId).order('data_venc', { ascending: false }),
    supabase.from('categorias_financeiras').select('*').eq('empresa_id', empresaId).order('nome'),
    supabase.from('cobrancas')
      .select('id, tipo, valor, status, descricao, created_at, link_pagamento, qr_code, linha_digitavel, vencimento, provider, os_id, venda_id, cliente_id, clientes(nome)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  return <FinanceiroView lancamentos={lancamentos ?? []} categorias={categorias ?? []} cobrancas={cobrancas ?? []} />
}
