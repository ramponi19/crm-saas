import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { contextoDaSessao, temPermissao } from '@/lib/sessao'
import { JUNCAO_CUSTO_COMPRA, valorDaCompra } from '@/lib/custo'
import ComprasView from './components/compras-view'

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function ComprasPage() {
  const [supabase, empresaId, ctx] = await Promise.all([createClient(), getEmpresaId(), contextoDaSessao()])
  const { data: { user } } = await supabase.auth.getUser()
  /**
   * CUSTO PROTEGIDO (etapa 1.1e): o valor do pedido de compra é custo e mora no satélite `compras_pedidos_custos`.
   * Sem `estoque.ver_custo` o servidor nem pede a junção — a tela não recebe valor nenhum. Lista explícita no lugar
   * do `select('*')`, que traria a coluna antiga.
   */
  const verCusto = temPermissao(ctx, 'estoque.ver_custo')

  const [{ data: pedidosRaw }, { data: fornecedores }, vinculoRes, usuarioRes] = await Promise.all([
    supabase.from('compras_pedidos')
      .select(`id, descricao, status, data_pedido, created_at, observacoes, fornecedor_id, ${verCusto ? `${JUNCAO_CUSTO_COMPRA}, ` : ''}fornecedores:estoque_fornecedores(nome_fantasia, contato, telefone)` as string)
      .eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    supabase.from('estoque_fornecedores')
      .select('id, nome_fantasia, razao_social, cnpj, contato, telefone, email, created_at')
      .eq('empresa_id', empresaId).eq('ativo', true).order('nome_fantasia'),
    user ? supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const role = (vinculoRes?.data as { role?: string } | null)?.role
  const isAdmin = !!((usuarioRes?.data as { is_super_admin?: boolean } | null)?.is_super_admin || role === 'owner' || role === 'admin')

  type PedidoRow = {
    id: number; descricao: string | null; status: string | null; data_pedido: string | null; created_at: string | null
    observacoes: string | null; fornecedor_id: number | null
    fornecedores: Embed<{ nome_fantasia: string; contato: string | null; telefone: string | null }>
    custo?: Embed<{ valor_total: number | null }>
  }
  const pedidos = ((pedidosRaw ?? []) as unknown as PedidoRow[]).map(({ custo, fornecedores: f, ...p }) => ({
    ...p,
    fornecedores: one(f),
    // null = sem a permissão (a junção nem foi pedida) ou valor ainda não informado.
    valor: verCusto ? valorDaCompra({ custo }) : null,
  }))

  return <ComprasView pedidos={pedidos} fornecedores={fornecedores ?? []} isAdmin={isAdmin} verCusto={verCusto} />
}
