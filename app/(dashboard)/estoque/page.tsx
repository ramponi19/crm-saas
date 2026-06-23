import { createClient, getEmpresaId } from '@/lib/supabase/server'
import EstoqueView from './components/estoque-view'

export const metadata = { title: 'Estoque' }

export default async function EstoquePage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: unidades }, { data: marcas }, { data: categorias }, { data: produtosRaw }, { data: movsRaw }] = await Promise.all([
    supabase
      .from('inventario_unidades')
      .select(`*, produtos!produto_id(nome, marcas_produtos!marca_id(nome)), fornecedores!fornecedor_id(nome_fantasia)`)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('created_at', { ascending: false }),
    supabase.from('marcas_produtos').select('*').eq('empresa_id', empresaId).order('nome'),
    supabase.from('categorias_produtos').select('*').eq('empresa_id', empresaId).order('nome'),
    supabase.from('produtos').select(`id, nome, marca_id, categoria_id, ativo, marcas_produtos!marca_id(nome), categorias_produtos!categoria_id(nome)`).eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('movimentacao_estoque').select(`*, produtos!produto_id(nome), usuarios!usuario_id(nome)`).eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100),
  ])

  const itens = (unidades ?? []).map((u: any) => ({
    ...u,
    produto_nome: u.produtos?.nome ?? '—',
    marca_nome: u.produtos?.marcas_produtos?.nome ?? '—',
    fornecedor_nome: u.fornecedores?.nome_fantasia ?? null,
  }))

  const produtos = (produtosRaw ?? []).map((p: any) => ({
    id: p.id, nome: p.nome, marca_id: p.marca_id,
    marca_nome: p.marcas_produtos?.nome ?? '—',
    categoria_id: p.categoria_id,
    categoria_nome: p.categorias_produtos?.nome ?? null,
    ativo: p.ativo,
  }))

  const movimentacoes = (movsRaw ?? []).map((m: any) => ({
    id: m.id,
    produto_nome: m.produtos?.nome ?? '—',
    tipo_movimento: m.tipo_movimento,
    quantidade: m.quantidade,
    observacoes: m.observacoes ?? null,
    created_at: m.created_at,
    usuario_nome: m.usuarios?.nome ?? null,
  }))

  return (
    <EstoqueView
      itens={itens}
      movimentacoes={movimentacoes}
      marcas={marcas ?? []}
      categorias={categorias ?? []}
      produtos={produtos}
    />
  )
}
