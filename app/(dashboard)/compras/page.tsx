import { createClient } from '@/lib/supabase/server'
import ComprasView from './components/compras-view'

export default async function ComprasPage() {
  const supabase = await createClient()

  const { data: pedidosRaw } = await supabase
    .from('pedidos_compra')
    .select('*, fornecedores!fornecedor_id(nome_fantasia, razao_social)')
    .order('created_at', { ascending: false })

  const { data: fornecedores } = await supabase
    .from('fornecedores')
    .select('id, nome_fantasia, razao_social, cnpj, telefone, email, contato, observacoes')
    .eq('ativo', true)
    .order('nome_fantasia')

  const pedidos = (pedidosRaw ?? []).map((p: any) => ({
    ...p,
    fornecedor_nome: p.fornecedores?.nome_fantasia ?? p.fornecedores?.razao_social ?? 'Sem fornecedor',
  }))

  return <ComprasView pedidos={pedidos} fornecedores={fornecedores ?? []} />
}
