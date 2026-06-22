import { createClient } from '@/lib/supabase/server'
import ComprasView from './components/compras-view'

export default async function ComprasPage() {
  const supabase = await createClient()
  const [{ data: pedidos }, { data: fornecedores }] = await Promise.all([
    supabase.from('pedidos_compra').select('*, fornecedores(nome, contato, telefone)').order('created_at', { ascending: false }),
    supabase.from('fornecedores').select('*').order('nome'),
  ])
  return <ComprasView pedidos={pedidos ?? []} fornecedores={fornecedores ?? []} />
}
