import { createClient } from '@/lib/supabase/server'
import AssistenciaView from './components/assistencia-view'

export default async function AssistenciaPage() {
  const supabase = await createClient()

  const { data: ordensRaw } = await supabase
    .from('garantias_assistencias')
    .select(`
      *,
      clientes!cliente_id(nome, telefone),
      produtos!produto_id(nome, marcas_produtos!marca_id(nome)),
      usuarios!responsavel_tecnico_id(nome)
    `)
    .order('created_at', { ascending: false })

  const { data: clientes } = await supabase
    .from('clientes').select('id, nome, telefone').eq('ativo', true).order('nome')

  const { data: produtos } = await supabase
    .from('produtos').select('id, nome, marcas_produtos!marca_id(nome)').eq('ativo', true).order('nome')

  const { data: tecnicos } = await supabase
    .from('usuarios').select('id, nome').order('nome')

  const ordens = (ordensRaw ?? []).map((o: any) => ({
    ...o,
    cliente_nome: o.clientes?.nome ?? 'Sem cliente',
    cliente_telefone: o.clientes?.telefone ?? null,
    produto_nome: o.produtos ? `${o.produtos.marcas_produtos?.nome ?? ''} ${o.produtos.nome}`.trim() : '—',
    tecnico_nome: o.usuarios?.nome ?? null,
  }))

  const produtosFormatados = (produtos ?? []).map((p: any) => ({
    id: p.id,
    nome: `${p.marcas_produtos?.nome ?? ''} ${p.nome}`.trim(),
  }))

  return (
    <AssistenciaView
      ordens={ordens}
      clientes={clientes ?? []}
      produtos={produtosFormatados}
      tecnicos={tecnicos ?? []}
    />
  )
}
