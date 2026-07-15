import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { RelatoriosView } from '@/components/modules/relatorios/relatorios-view'
import { RelatoriosImobView } from '@/components/modules/relatorios/relatorios-imob-view'
import { exigirPlano } from '@/lib/acesso'
import { normalizarSegmento } from '@/lib/segmentos'
import type { Tables } from '@/types/database'

export const metadata = { title: 'Relatórios' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

// Roteador único de relatórios por segmento (imobiliária → relatório imob;
// demais → BI genérico, plan-gated). Substitui a rota órfã /relatorios-imob.
export default async function RelatoriosPage() {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).single()

  if (normalizarSegmento(empresa?.segmento) === 'imobiliaria') {
    return (
      <>
        <Topbar title="Relatórios" />
        <RelatoriosImobView />
      </>
    )
  }

  await exigirPlano('bi')

  const [{ data: vendasRaw }, { data: lancamentos }, { data: vendedoresRaw }] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, data_venda, valor_venda, desconto_valor, lucro, forma_pagamento, canal_venda, status, clientes!cliente_id(nome), produtos!produto_id(nome), usuarios!vendedor_id(nome)')
      .eq('empresa_id', empresaId).not('status', 'in', '("encomenda","pendente_entrega")').order('data_venda', { ascending: false }).limit(500),
    supabase
      .from('lancamentos_financeiros')
      .select('id, data_venc, descricao, categoria, tipo, valor, status')
      .eq('empresa_id', empresaId).order('data_venc', { ascending: false }).limit(200),
    supabase
      .from('empresa_usuarios')
      .select('usuarios!empresa_usuarios_usuario_public_fkey(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
  ])

  type VendaRow = Tables<'vendas'> & {
    clientes: Embed<{ nome: string | null }>
    produtos: Embed<{ nome: string | null }>
    usuarios: Embed<{ nome: string | null }>
  }
  const vendas = ((vendasRaw ?? []) as unknown as VendaRow[]).map((v) => ({
    ...v,
    cliente_nome: one(v.clientes)?.nome ?? null,
    produto_nome: one(v.produtos)?.nome ?? null,
    vendedor_nome: one(v.usuarios)?.nome ?? null,
  }))

  type VendedorRow = { usuarios: Embed<{ nome: string | null }> }
  const vendedores = [...new Set(
    ((vendedoresRaw ?? []) as unknown as VendedorRow[]).map((eu) => one(eu.usuarios)?.nome).filter((n): n is string => Boolean(n)),
  )]

  return (
    <>
      <Topbar title="Relatórios" />
      <RelatoriosView vendas={vendas} lancamentos={lancamentos ?? []} vendedores={vendedores} />
    </>
  )
}
