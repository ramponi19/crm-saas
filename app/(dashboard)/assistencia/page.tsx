import { createClient } from '@/lib/supabase/server'
import AssistenciaView from './components/assistencia-view'

export default async function AssistenciaPage() {
  const supabase = await createClient()
  const { data: ordens } = await supabase
    .from('garantias_assistencias')
    .select('*, clientes(nome, telefone), produtos(nome)')
    .eq('tipo', 'assistencia')
    .order('created_at', { ascending: false })
  return <AssistenciaView ordens={ordens ?? []} />
}
