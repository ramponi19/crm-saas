import { createClient, getEmpresaId } from '@/lib/supabase/server'
import ProdutosView from './components/produtos-view'

export const metadata = { title: 'Produtos' }

type Rel = { nome: string | null } | { nome: string | null }[] | null
const relNome = (r: Rel): string | null => (Array.isArray(r) ? r[0]?.nome : r?.nome) ?? null

interface ProdutoRow {
  id: number
  nome: string
  marca_id: number | null
  categoria_id: number | null
  ativo: boolean | null
  marca: Rel
  categoria: Rel
}
interface UnidadeRow {
  produto_id: number | null
  preco_custo: number | null
  preco_venda: number | null
  status: string | null
}

export default async function ProdutosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: produtosRaw }, { data: marcas }, { data: categorias }] = await Promise.all([
    supabase
      .from('produtos')
      .select(`
        id, nome, marca_id, categoria_id, ativo,
        marca:marcas_produtos(nome),
        categoria:categorias_produtos(nome)
      `)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('nome'),
    supabase.from('marcas_produtos').select('id, nome').eq('empresa_id', empresaId).order('nome'),
    supabase.from('categorias_produtos').select('id, nome').eq('empresa_id', empresaId).order('nome'),
  ])

  // Busca estoque e preços por produto
  const { data: unidades } = await supabase
    .from('inventario_unidades')
    .select('produto_id, preco_custo, preco_venda, status')
    .eq('empresa_id', empresaId)

  const unidadesList = (unidades ?? []) as unknown as UnidadeRow[]
  const estoqueMap: Record<number, { estoque: number; custo_min: number | null; preco_max: number | null }> = {}
  for (const u of unidadesList) {
    if (u.produto_id == null) continue
    const pid = u.produto_id
    if (!estoqueMap[pid]) estoqueMap[pid] = { estoque: 0, custo_min: null, preco_max: null }
    if (u.status === 'disponivel') {
      estoqueMap[pid].estoque++
      const custo = u.preco_custo
      const preco = u.preco_venda
      if (custo && (estoqueMap[pid].custo_min === null || custo < estoqueMap[pid].custo_min!))
        estoqueMap[pid].custo_min = custo
      if (preco && (estoqueMap[pid].preco_max === null || preco > estoqueMap[pid].preco_max!))
        estoqueMap[pid].preco_max = preco
    }
  }

  const produtos = ((produtosRaw ?? []) as unknown as ProdutoRow[]).map(p => ({
    id: p.id,
    nome: p.nome,
    marca_id: p.marca_id,
    categoria_id: p.categoria_id,
    marca_nome: relNome(p.marca) ?? '',
    categoria_nome: relNome(p.categoria),
    ativo: p.ativo ?? false,
    estoque: estoqueMap[p.id]?.estoque ?? 0,
    custo_min: estoqueMap[p.id]?.custo_min ?? null,
    preco_max: estoqueMap[p.id]?.preco_max ?? null,
  }))

  return (
    <ProdutosView
      produtos={produtos}
      marcas={(marcas ?? []) as { id: number; nome: string }[]}
      categorias={(categorias ?? []) as { id: number; nome: string }[]}
    />
  )
}
