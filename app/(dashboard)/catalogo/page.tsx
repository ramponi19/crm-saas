import { createClient } from '@/lib/supabase/server'
import CatalogoView from './components/catalogo-view'

export const metadata = { title: 'Catálogo' }

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
      id, produto_id, imei, numero_serie, estado, tipo,
      preco_custo, custo_reparo, preco_venda, status, created_at,
      produtos!produto_id(nome)
    `).eq('ativo', true).order('created_at', { ascending: false }),
    supabase.from('categorias_produtos').select('id, nome').order('nome'),
    supabase.from('subcategorias_produtos').select('id, nome, categoria_id').order('nome'),
    supabase.from('marcas_produtos').select('id, nome').order('nome'),
  ])

  // Conta produtos por categoria e marca
  const prodPorCat: Record<number, number> = {}
  const prodPorMarca: Record<number, number> = {}
  for (const p of produtosRaw ?? []) {
    if ((p as any).categoria_id) prodPorCat[(p as any).categoria_id] = (prodPorCat[(p as any).categoria_id] ?? 0) + 1
    if ((p as any).marca_id) prodPorMarca[(p as any).marca_id] = (prodPorMarca[(p as any).marca_id] ?? 0) + 1
  }

  // Subcategorias por categoria
  const subsByCat: Record<number, string[]> = {}
  for (const s of subcatsRaw ?? []) {
    const cid = (s as any).categoria_id
    if (!subsByCat[cid]) subsByCat[cid] = []
    subsByCat[cid].push((s as any).nome)
  }

  const produtos = (produtosRaw ?? []).map((p: any) => ({
    id: p.id,
    nome: p.nome,
    marca_id: p.marca_id,
    marca_nome: p.marcas_produtos?.nome ?? '—',
    categoria_id: p.categoria_id,
    categoria_nome: p.categorias_produtos?.nome ?? null,
    subcategoria_nome: p.subcategorias_produtos?.nome ?? null,
    preco_novo: null as number | null,
    preco_usado: null as number | null,
  }))

  const unidades = (unidadesRaw ?? []).map((u: any) => ({
    id: u.id,
    produto_nome: u.produtos?.nome ?? '—',
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
  for (const u of unidadesRaw ?? []) {
    const pid = (u as any).produto_id
    if (!precoPorProduto[pid]) precoPorProduto[pid] = { novo: [], usado: [] }
    const venda = (u as any).preco_venda
    if (!venda) continue
    const condicao = (u as any).condicao ?? 'novo'
    if (condicao === 'novo') precoPorProduto[pid].novo.push(venda)
    else precoPorProduto[pid].usado.push(venda)
  }
  for (const p of produtos) {
    const pc = precoPorProduto[p.id]
    if (!pc) continue
    if (pc.novo.length) p.preco_novo = Math.min(...pc.novo)
    if (pc.usado.length) p.preco_usado = Math.min(...pc.usado)
  }

  const categorias = (categsRaw ?? []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    total_produtos: prodPorCat[c.id] ?? 0,
    subcategorias: subsByCat[c.id] ?? [],
  }))

  const marcas = (marcasRaw ?? []).map((m: any) => ({
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
