import { createClient, getEmpresaId } from '@/lib/supabase/server'
import AssistenciaView from './components/assistencia-view'

export default async function AssistenciaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const [{ data: ordens }, { data: servicos }] = await Promise.all([
    supabase
      .from('garantias_assistencias')
      .select('*, clientes(nome, telefone), produtos(nome)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'assistencia')
      .order('created_at', { ascending: false }),
    supabase
      .from('servicos_reparo')
      .select('id, nome, categoria, preco, tempo_estimado_min, ativo')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome'),
  ])
  return <AssistenciaView ordens={ordens ?? []} servicos={(servicos ?? []) as never} />
}
