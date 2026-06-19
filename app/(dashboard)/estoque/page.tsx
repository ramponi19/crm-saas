import { createClient } from '@/lib/supabase/server'
import EstoqueView from './components/estoque-view'

export default async function EstoquePage() {
  const supabase = await createClient()

  const { data: unidades } = await supabase
    .from('inventario_unidades')
    .select(`
      *,
      produtos!produto_id(nome, marcas_produtos!marca_id(nome)),
      fornecedores!fornecedor_id(nome_fantasia)
    `)
    .eq('ativo', true)
    .order('created_at', { ascending: false })

  const { data: marcas } = await supabase.from('marcas_produtos').select('*').order('nome')
  const { data: categorias } = await supabase.from('categorias_produtos').select('*').order('nome')

  const { data: produtosRaw } = await supabase
    .from('produtos')
    .select(`
      id, nome, marca_id, categoria_id, ativo,
      marcas_produtos!marca_id(nome),
      categorias_produtos!categoria_id(nome)
    `)
    .eq('ativo', true)
    .order('nome')

  const itens = (unidades ?? []).map((u: any) => ({
    ...u,
    produto_nome: u.produtos?.nome ?? '—',
    marca_nome: u.produtos?.marcas_produtos?.nome ?? '—',
    fornecedor_nome: u.fornecedores?.nome_fantasia ?? null,
  }))

  const produtos = (produtosRaw ?? []).map((p: any) => ({
    id: p.id,
    nome: p.nome,
    marca_id: p.marca_id,
    marca_nome: p.marcas_produtos?.nome ?? '—',
    categoria_id: p.categoria_id,
    categoria_nome: p.categorias_produtos?.nome ?? null,
    ativo: p.ativo,
  }))

  return (
    <EstoqueView
      itens={itens}
      marcas={marcas ?? []}
      categorias={categorias ?? []}
      produtos={produtos}
    />
  )
}
