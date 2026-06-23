import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { HistoricoView } from '@/components/modules/historico/historico-view'

export const metadata = { title: 'Histórico de Vendas' }

export default async function HistoricoPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

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

  const vendas = (vendasRaw ?? []).map((v: any) => ({
    id:            v.id,
    data_venda:    v.data_venda,
    valor_venda:   Number(v.valor_venda),
    lucro:         v.lucro != null ? Number(v.lucro) : null,
    forma_pagamento: v.forma_pagamento,
    canal_venda:   v.canal_venda,
    status:        v.status,
    parcelas:      v.parcelas,
    cliente_nome:  v.clientes?.nome  ?? null,
    produto_nome:  v.produtos?.nome  ?? null,
    vendedor_nome: v.usuarios?.nome  ?? null,
  }))

  return (
    <>
      <Topbar eyebrow="VENDAS · HISTÓRICO" title="Histórico de vendas" />
      <HistoricoView vendas={vendas} />
    </>
  )
}
