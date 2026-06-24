import { createClient, getEmpresaId } from '@/lib/supabase/server'
import ClientesView from './components/clientes-view'

export default async function ClientesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome')

  return <ClientesView clientes={clientesRaw ?? []} />
}
