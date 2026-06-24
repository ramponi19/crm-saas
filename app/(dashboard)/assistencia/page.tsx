import { createClient, getEmpresaId } from '@/lib/supabase/server'
import AssistenciaView from './components/assistencia-view'

export default async function AssistenciaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: ordens } = await supabase
    .from('garantias_assistencias')
    .select('*, clientes(nome, telefone), produtos(nome)')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'assistencia')
    .order('created_at', { ascending: false })
  return <AssistenciaView ordens={ordens ?? []} />
}
