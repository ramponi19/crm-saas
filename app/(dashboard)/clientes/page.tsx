import { createClient } from '@/lib/supabase/server'
import ClientesView from './components/clientes-view'

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('*')
    .order('nome')

  return <ClientesView clientes={clientesRaw ?? []} />
}
