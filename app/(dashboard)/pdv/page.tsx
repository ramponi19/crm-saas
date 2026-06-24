import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import PDVView from './components/pdv-view'
import type { Tables } from '@/types/database'

export const metadata = { title: 'PDV' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function PDVPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [
    { data: unidades },
    { data: clientes },
    { data: taxas },
    { data: vendasRecentes },
  ] = await Promise.all([
    supabase
      .from('inventario_unidades')
      .select('id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_custo, preco_venda, status, produtos!produto_id(nome, marcas_produtos!marca_id(nome))')
      .eq('empresa_id', empresaId)
      .eq('ativo', true).eq('status', 'disponivel')
      .order('created_at', { ascending: false }),
    supabase.from('clientes').select('id, nome, telefone, cpf_cnpj').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('taxas_pagamento').select('*').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('vendas')
      .select('id, valor_venda, valor_custo, lucro, forma_pagamento, data_venda, status, clientes!cliente_id(nome), produtos!produto_id(nome)')
      .eq('empresa_id', empresaId)
      .order('data_venda', { ascending: false }).limit(20),
  ])

  type UnidadeRow = Tables<'inventario_unidades'> & {
    produtos: Embed<{ nome: string | null; marcas_produtos: Embed<{ nome: string | null }> }>
  }
  const itens = ((unidades ?? []) as unknown as UnidadeRow[]).map(u => {
    const prod = one(u.produtos)
    return {
      ...u,
      produto_id: u.produto_id ?? 0,
      status: u.status ?? 'disponivel',
      produto_nome: prod?.nome ?? '—',
      marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '—',
    }
  })

  type VendaRow = Tables<'vendas'> & {
    clientes: Embed<{ nome: string | null }>
    produtos: Embed<{ nome: string | null }>
  }
  const vendasFmt = ((vendasRecentes ?? []) as unknown as VendaRow[]).map(v => ({
    ...v,
    data_venda: v.data_venda ?? '',
    cliente_nome: one(v.clientes)?.nome ?? 'Sem cliente',
    produto_nome: one(v.produtos)?.nome ?? '—',
  }))

  return (
    <>
      <Topbar eyebrow="VENDAS" title="PDV — Ponto de Venda" />
      <div className="flex-1 overflow-hidden">
        <PDVView
          itensDisponiveis={itens}
          clientes={clientes ?? []}
          taxas={taxas ?? []}
          vendasRecentes={vendasFmt}
        />
      </div>
    </>
  )
}
