import { createClient, getEmpresaId } from '@/lib/supabase/server'
import EstoqueView from './components/estoque-view'
import { normalizarSegmento } from '@/lib/segmentos'
import type { Tables } from '@/types/database'

export const metadata = { title: 'Estoque' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function EstoquePage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: unidades }, { data: marcas }, { data: categorias }, { data: produtosRaw }, { data: movsRaw }, { data: empresa }, { data: clientesRaw }, { data: tabelaRaw }] = await Promise.all([
    supabase
      .from('inventario_unidades')
      // NÃO dá para embutir o responsável aqui: `inventario_unidades.usuario_id`
      // tem FK para `auth.users`, não para `public.usuarios`. Pedir
      // `usuarios!usuario_id(nome)` derruba a consulta INTEIRA no PostgREST e a
      // página recebe `null` — o estoque aparecia vazio. O nome vem numa consulta
      // separada, logo abaixo.
      .select(`*, produtos!produto_id(nome, foto_url, marcas_produtos!marca_id(nome)), fornecedores!fornecedor_id(nome_fantasia)`)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('created_at', { ascending: false }),
    supabase.from('marcas_produtos').select('*').eq('empresa_id', empresaId).order('nome'),
    supabase.from('categorias_produtos').select('*').eq('empresa_id', empresaId).order('nome'),
    supabase.from('produtos').select(`id, nome, marca_id, categoria_id, ativo, marcas_produtos!marca_id(nome), categorias_produtos!categoria_id(nome)`).eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('movimentacao_estoque').select(`*, produtos!produto_id(nome), usuarios!usuario_id(nome)`).eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100),
    supabase.from('empresas').select('segmento').eq('id', empresaId).single(),
    supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('tabela_precos').select('modelo, armazenamento, condicao, preco_sugerido').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  // Nome de quem respondeu pela unidade (entrada por troca). Consulta à parte
  // porque o embed não é possível — ver o comentário no select acima.
  const responsaveisIds = [...new Set(
    ((unidades ?? []) as { usuario_id: string | null }[])
      .map((u) => u.usuario_id).filter((id): id is string => !!id),
  )]
  const nomePorUsuario = new Map<string, string>()
  if (responsaveisIds.length) {
    const { data: resps } = await supabase.from('usuarios').select('id, nome').in('id', responsaveisIds)
    for (const r of (resps ?? []) as { id: string; nome: string | null }[]) {
      if (r.nome) nomePorUsuario.set(r.id, r.nome)
    }
  }

  type UnidadeRow = Tables<'inventario_unidades'> & {
    produtos: Embed<{ nome: string | null; foto_url: string | null; marcas_produtos: Embed<{ nome: string | null }> }>
    fornecedores: Embed<{ nome_fantasia: string | null }>
  }
  const itens = ((unidades ?? []) as unknown as UnidadeRow[]).map(u => {
    const prod = one(u.produtos)
    return {
      ...u,
      produto_id: u.produto_id ?? null,
      produto_nome: prod?.nome ?? (u.observacoes?.split(' (cliente')[0]?.trim() || '—'),
      produto_foto: prod?.foto_url ?? null,
      marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '—',
      fornecedor_nome: one(u.fornecedores)?.nome_fantasia ?? null,
      responsavel_nome: u.usuario_id ? nomePorUsuario.get(u.usuario_id) ?? null : null,
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
      clientes={(clientesRaw ?? []) as { id: number; nome: string }[]}
      tabelaPrecos={(tabelaRaw ?? []) as unknown as { modelo: string; armazenamento: string | null; condicao: string; preco_sugerido: number }[]}
      empresaId={empresaId!}
      segmento={normalizarSegmento(empresa?.segmento)}
    />
  )
}
