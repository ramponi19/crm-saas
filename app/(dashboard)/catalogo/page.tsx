import { createClient } from '@/lib/supabase/server'
import CatalogoView from './components/catalogo-view'

export const metadata = { title: 'Catálogo' }

// Relações to-one do PostgREST podem vir como objeto ou array conforme a
// inferência; normalizamos com este helper.
type Rel = { nome: string | null } | { nome: string | null }[] | null
const relNome = (r: Rel): string | null => (Array.isArray(r) ? r[0]?.nome : r?.nome) ?? null

interface ProdutoRow {
  id: number
  nome: string
  marca_id: number | null
  categoria_id: number | null
  marcas_produtos: Rel
  categorias_produtos: Rel
  subcategorias_produtos: Rel
}
interface UnidadeRow {
  id: number
  produto_id: number | null
  imei: string | null
  numero_serie: string | null
  estado: string | null
  tipo: string | null
  condicao: string | null
  preco_custo: number | null
  custo_reparo: number | null
  preco_venda: number | null
  status: string | null
  created_at: string
  produtos: Rel
}
interface CategoriaRow { id: number; nome: string }
interface SubcategoriaRow { id: number; nome: string; categoria_id: number | null }
interface MarcaRow { id: number; nome: string }

export default async function CatalogoPage() {
  const supabase = await createClient()

  const [{ data: produtosRaw }, { data: unidadesRaw }, { data: categsRaw }, { data: subcatsRaw }, { data: marcasRaw }] = await Promise.all([
    supabase.from('produtos').select(`
      id, nome, marca_id, categoria_id,
      marcas_produtos!marca_id(nome),
      categorias_produtos!categoria_id(nome),
      subcategorias_produtos!subcategoria_id(nome)
    `).eq('ativo', true).order('nome'),
    supabase.from('inventario_unidades').select(`
      id, produto_id, imei, numero_serie, estado, tipo, condicao,
      preco_custo, custo_reparo, preco_venda, status, created_at,
      produtos!produto_id(nome)
    `).eq('ativo', true).order('created_at', { ascending: false }),
    supabase.from('categorias_produtos').select('id, nome').order('nome'),
    supabase.from('subcategorias_produtos').select('id, nome, categoria_id').order('nome'),
    supabase.from('marcas_produtos').select('id, nome').order('nome'),
  ])

  const produtosList = (produtosRaw ?? []) as unknown as ProdutoRow[]
  const unidadesList = (unidadesRaw ?? []) as unknown as UnidadeRow[]
  const categsList   = (categsRaw ?? []) as unknown as CategoriaRow[]
  const subcatsList  = (subcatsRaw ?? []) as unknown as SubcategoriaRow[]
  const marcasList   = (marcasRaw ?? []) as unknown as MarcaRow[]

  // Conta produtos por categoria e marca
  const prodPorCat: Record<number, number> = {}
  const prodPorMarca: Record<number, number> = {}
  for (const p of produtosList) {
    if (p.categoria_id) prodPorCat[p.categoria_id] = (prodPorCat[p.categoria_id] ?? 0) + 1
    if (p.marca_id) prodPorMarca[p.marca_id] = (prodPorMarca[p.marca_id] ?? 0) + 1
  }

  // Subcategorias por categoria
  const subsByCat: Record<number, string[]> = {}
  for (const s of subcatsList) {
    if (s.categoria_id == null) continue
    if (!subsByCat[s.categoria_id]) subsByCat[s.categoria_id] = []
    subsByCat[s.categoria_id].push(s.nome)
  }

  const produtos = produtosList.map(p => ({
    id: p.id,
    nome: p.nome,
    marca_id: p.marca_id,
    marca_nome: relNome(p.marcas_produtos) ?? '—',
    categoria_id: p.categoria_id,
    categoria_nome: relNome(p.categorias_produtos),
    subcategoria_nome: relNome(p.subcategorias_produtos),
    preco_novo: null as number | null,
    preco_usado: null as number | null,
  }))

  const unidades = unidadesList.map(u => ({
    id: u.id,
    produto_nome: relNome(u.produtos) ?? '—',
    imei: u.imei,
    numero_serie: u.numero_serie,
    estado: u.estado,
    tipo: u.tipo,
    preco_custo: u.preco_custo,
    custo_reparo: u.custo_reparo,
    preco_venda: u.preco_venda,
    status: u.status,
    created_at: u.created_at,
  }))

  // Preços novo/usado: pega médias do inventário por produto
  const precoPorProduto: Record<number, { novo: number[]; usado: number[] }> = {}
  for (const u of unidadesList) {
    if (u.produto_id == null) continue
    if (!precoPorProduto[u.produto_id]) precoPorProduto[u.produto_id] = { novo: [], usado: [] }
    if (!u.preco_venda) continue
    const condicao = u.condicao ?? 'novo'
    if (condicao === 'novo') precoPorProduto[u.produto_id].novo.push(u.preco_venda)
    else precoPorProduto[u.produto_id].usado.push(u.preco_venda)
  }
  for (const p of produtos) {
    const pc = precoPorProduto[p.id]
    if (!pc) continue
    if (pc.novo.length) p.preco_novo = Math.min(...pc.novo)
    if (pc.usado.length) p.preco_usado = Math.min(...pc.usado)
  }

  const categorias = categsList.map(c => ({
    id: c.id,
    nome: c.nome,
    total_produtos: prodPorCat[c.id] ?? 0,
    subcategorias: subsByCat[c.id] ?? [],
  }))

  const marcas = marcasList.map(m => ({
    id: m.id,
    nome: m.nome,
    total_produtos: prodPorMarca[m.id] ?? 0,
  }))

  return (
    <CatalogoView
      produtos={produtos}
      unidades={unidades}
      categorias={categorias}
      marcas={marcas}
      tabelaPrecos={[]}
    />
  )
}
