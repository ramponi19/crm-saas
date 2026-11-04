import { createClient, getEmpresaId } from '@/lib/supabase/server'
import AssistenciaView from './components/assistencia-view'
import { comNomeDoCliente } from '@/lib/sem-nome'

export default async function AssistenciaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const [{ data: ordens }, { data: servicos }] = await Promise.all([
    supabase
      .from('assistencia_garantias')
      .select('*, clientes(nome, telefone), produtos:estoque_produtos(nome)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'assistencia')
      .order('created_at', { ascending: false }),
    supabase
      .from('assistencia_servicos')
      .select('id, nome, categoria, preco, tempo_estimado_min, ativo')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome'),
  ])
  return <AssistenciaView ordens={(ordens ?? []).map(comNomeDoCliente)} servicos={(servicos ?? []) as never} />
}
