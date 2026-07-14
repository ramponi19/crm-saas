import { createClient, getEmpresaId } from '@/lib/supabase/server'
import ComprasView from './components/compras-view'

export default async function ComprasPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: pedidos }, { data: fornecedores }, vinculoRes, usuarioRes] = await Promise.all([
    supabase.from('pedidos_compra').select('*, fornecedores(nome_fantasia, contato, telefone)').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    supabase.from('fornecedores').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome_fantasia'),
    user ? supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const role = (vinculoRes?.data as { role?: string } | null)?.role
  const isAdmin = !!((usuarioRes?.data as { is_super_admin?: boolean } | null)?.is_super_admin || role === 'owner' || role === 'admin')

  return <ComprasView pedidos={pedidos ?? []} fornecedores={fornecedores ?? []} isAdmin={isAdmin} />
}
