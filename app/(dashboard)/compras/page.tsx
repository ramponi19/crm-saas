import { createClient, getEmpresaId } from '@/lib/supabase/server'
import ComprasView from './components/compras-view'

export default async function ComprasPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const [{ data: pedidos }, { data: fornecedores }] = await Promise.all([
    supabase.from('pedidos_compra').select('*, fornecedores(nome_fantasia, contato, telefone)').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    supabase.from('fornecedores').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome_fantasia'),
  ])
  return <ComprasView pedidos={pedidos ?? []} fornecedores={fornecedores ?? []} />
}
