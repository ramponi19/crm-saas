import { createClient, getEmpresaId } from '@/lib/supabase/server'
import EstoqueView from './components/estoque-view'
import type { Tables } from '@/types/database'

export const metadata = { title: 'Estoque' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

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

  type UnidadeRow = Tables<'inventario_unidades'> & {
    produtos: Embed<{ nome: string | null; marcas_produtos: Embed<{ nome: string | null }> }>
    fornecedores: Embed<{ nome_fantasia: string | null }>
  }
  const itens = ((unidades ?? []) as unknown as UnidadeRow[]).map(u => {
    const prod = one(u.produtos)
    return {
      ...u,
      produto_id: u.produto_id ?? 0,
      produto_nome: prod?.nome ?? '—',
      marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '—',
      fornecedor_nome: one(u.fornecedores)?.nome_fantasia ?? null,
    }
  })

  type ProdutoRow = {
    id: number; nome: string; marca_id: number | null; categoria_id: number | null; ativo: boolean | null
    marcas_produtos: Embed<{ nome: string | null }>
    categorias_produtos: Embed<{ nome: string | null }>
  }
  const produtos = ((produtosRaw ?? []) as unknown as ProdutoRow[]).map(p => ({
    id: p.id, nome: p.nome, marca_id: p.marca_id,
    marca_nome: one(p.marcas_produtos)?.nome ?? '—',
    categoria_id: p.categoria_id,
    categoria_nome: one(p.categorias_produtos)?.nome ?? null,
    ativo: p.ativo ?? false,
  }))

  type MovRow = Tables<'movimentacao_estoque'> & {
    produtos: Embed<{ nome: string | null }>
    usuarios: Embed<{ nome: string | null }>
  }
  const movimentacoes = ((movsRaw ?? []) as unknown as MovRow[]).map(m => ({
    id: m.id,
    produto_nome: one(m.produtos)?.nome ?? '—',
    tipo_movimento: m.tipo_movimento,
    quantidade: m.quantidade,
    observacoes: m.observacoes ?? null,
    created_at: m.created_at ?? '',
    usuario_nome: one(m.usuarios)?.nome ?? null,
  }))

  return (
    <EstoqueView
      itens={itens}
      movimentacoes={movimentacoes}
      marcas={marcas ?? []}
      categorias={categorias ?? []}
      produtos={produtos}
      empresaId={empresaId!}
    />
  )
}
