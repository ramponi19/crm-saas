import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClientesView from './components/clientes-view'

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!vinculo) redirect('/login')

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('*')
    .eq('empresa_id', vinculo.empresa_id)
    .order('nome')

  return <ClientesView clientes={clientesRaw ?? []} />
}
