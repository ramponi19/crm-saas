import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { HistoricoView } from '@/components/modules/historico/historico-view'

export const metadata = { title: 'Histórico de Vendas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function HistoricoPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: vinculo }, { data: usuario }, { data: membrosRaw }] = await Promise.all([
    user ? supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single() : Promise.resolve({ data: null }),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])
  const isAdmin = !!((usuario as { is_super_admin?: boolean } | null)?.is_super_admin || (vinculo as { role?: string } | null)?.role === 'owner' || (vinculo as { role?: string } | null)?.role === 'admin')
  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const vendedores = ((membrosRaw ?? []) as unknown as MembroRow[]).map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  const { data: vendasRaw } = await supabase
    .from('vendas')
    .select(`
      id, data_venda, valor_venda, lucro, forma_pagamento,
      canal_venda, status, parcelas,
      clientes!cliente_id(nome),
      produtos!produto_id(nome),
      usuarios!vendedor_id(nome)
    `)
    .eq('empresa_id', empresaId)
    .order('data_venda', { ascending: false })
    .limit(500)

  type VendaRow = {
    id: number; data_venda: string | null; valor_venda: number; lucro: number | null
    forma_pagamento: string | null; canal_venda: string | null; status: string | null; parcelas: number | null
    clientes: Embed<{ nome: string | null }>
    produtos: Embed<{ nome: string | null }>
    usuarios: Embed<{ nome: string | null }>
  }
  const vendas = ((vendasRaw ?? []) as unknown as VendaRow[]).map(v => ({
    id:            v.id,
    data_venda:    v.data_venda,
    valor_venda:   Number(v.valor_venda),
    lucro:         v.lucro != null ? Number(v.lucro) : null,
    forma_pagamento: v.forma_pagamento,
    canal_venda:   v.canal_venda,
    status:        v.status,
    parcelas:      v.parcelas,
    cliente_nome:  one(v.clientes)?.nome  ?? null,
    produto_nome:  one(v.produtos)?.nome  ?? null,
    vendedor_nome: one(v.usuarios)?.nome  ?? null,
  }))

  return (
    <>
      <Topbar eyebrow="VENDAS · HISTÓRICO" title="Histórico de vendas" />
      <HistoricoView vendas={vendas} isAdmin={isAdmin} vendedores={vendedores} />
    </>
  )
}
