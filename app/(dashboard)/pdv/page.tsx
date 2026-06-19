import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import PDVView from './components/pdv-view'

export const metadata = { title: 'PDV' }

export default async function PDVPage() {
  const supabase = await createClient()

  const [
    { data: unidades },
    { data: clientes },
    { data: taxas },
    { data: vendasRecentes },
  ] = await Promise.all([
    supabase
      .from('inventario_unidades')
      .select('id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_custo, preco_venda, status, produtos!produto_id(nome, marcas_produtos!marca_id(nome))')
      .eq('ativo', true).eq('status', 'disponivel')
      .order('created_at', { ascending: false }),
    supabase.from('clientes').select('id, nome, telefone, cpf_cnpj').eq('ativo', true).order('nome'),
    supabase.from('taxas_pagamento').select('*').eq('ativo', true),
    supabase.from('vendas')
      .select('id, valor_venda, valor_custo, lucro, forma_pagamento, data_venda, status, clientes!cliente_id(nome), produtos!produto_id(nome)')
      .order('data_venda', { ascending: false }).limit(20),
  ])

  const itens = (unidades ?? []).map((u: any) => ({
    ...u,
    produto_nome: u.produtos?.nome ?? '—',
    marca_nome: u.produtos?.marcas_produtos?.nome ?? '—',
  }))

  const vendasFmt = (vendasRecentes ?? []).map((v: any) => ({
    ...v,
    cliente_nome: v.clientes?.nome ?? 'Sem cliente',
    produto_nome: v.produtos?.nome ?? '—',
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
