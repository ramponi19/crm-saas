import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { documentosDisponiveis } from '@/lib/contrato-emitir'
import { Topbar } from '@/components/layout/topbar'
import PDVView from './components/pdv-view'
import type { Tables } from '@/types/database'

export const metadata = { title: 'PDV' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function PDVPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: { user } } = await supabase.auth.getUser()

  // Expiração preguiçosa das reservas de lead (48h): vencida volta a disponível.
  await supabase
    .from('inventario_unidades')
    .update({ status: 'disponivel', reservado_lead_id: null, reservado_por: null, reservado_em: null, reserva_expira_em: null })
    .eq('empresa_id', empresaId)
    .eq('status', 'reservado')
    .not('reservado_lead_id', 'is', null)
    .lt('reserva_expira_em', new Date().toISOString())

  const [
    { data: unidades },
    { data: reservadas },
    { data: clientes },
    { data: taxas },
    { data: vendasRecentes },
    { data: empresa },
    { data: fornecedores },
    vinculoRes,
    usuarioRes,
  ] = await Promise.all([
    supabase
      .from('inventario_unidades')
      .select('id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_custo, preco_venda, status, fotos_urls, produtos!produto_id(nome, garantia_dias, foto_url, marcas_produtos!marca_id(nome))')
      .eq('empresa_id', empresaId)
      .eq('ativo', true).eq('status', 'disponivel')
      .order('created_at', { ascending: false }),
    // Reservas de lead ativas (aba Reservas do PDV).
    supabase
      .from('inventario_unidades')
      .select('id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_custo, preco_venda, status, fotos_urls, reservado_lead_id, reservado_por, reserva_expira_em, produtos!produto_id(nome, garantia_dias, foto_url, marcas_produtos!marca_id(nome)), leads!reservado_lead_id(nome)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true).eq('status', 'reservado')
      .not('reservado_lead_id', 'is', null)
      .order('reserva_expira_em', { ascending: true }),
    supabase.from('clientes').select('id, nome, telefone, cpf_cnpj').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('taxas_pagamento').select('*').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('vendas')
      .select('id, valor_venda, valor_custo, lucro, forma_pagamento, data_venda, status, clientes!cliente_id(nome), produtos!produto_id(nome)')
      .eq('empresa_id', empresaId)
      .order('data_venda', { ascending: false }).limit(20),
    supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle(),
    supabase.from('fornecedores').select('id, nome_fantasia').eq('empresa_id', empresaId).eq('ativo', true).order('nome_fantasia'),
    user ? supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const documentos = await documentosDisponiveis(supabase, empresaId!)

  const role = (vinculoRes?.data as { role?: string } | null)?.role
  const isAdmin = !!((usuarioRes?.data as { is_super_admin?: boolean } | null)?.is_super_admin || role === 'owner' || role === 'admin')

  type UnidadeRow = Tables<'inventario_unidades'> & {
    produtos: Embed<{ nome: string | null; garantia_dias: number | null; foto_url: string | null; marcas_produtos: Embed<{ nome: string | null }> }>
  }
  const itens = ((unidades ?? []) as unknown as UnidadeRow[]).map(u => {
    const prod = one(u.produtos)
    return {
      ...u,
      produto_id: u.produto_id ?? 0,
      status: u.status ?? 'disponivel',
      produto_nome: prod?.nome ?? '—',
      produto_garantia_dias: prod?.garantia_dias ?? null,
      produto_foto: prod?.foto_url ?? null,
      marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '—',
    }
  })

  type ReservaRow = UnidadeRow & { leads: Embed<{ nome: string | null }> }
  const reservas = ((reservadas ?? []) as unknown as ReservaRow[]).map(u => {
    const prod = one(u.produtos)
    return {
      ...u,
      produto_id: u.produto_id ?? 0,
      status: u.status ?? 'reservado',
      produto_nome: prod?.nome ?? '—',
      produto_garantia_dias: prod?.garantia_dias ?? null,
      produto_foto: prod?.foto_url ?? null,
      marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '—',
      lead_nome: one(u.leads)?.nome ?? '—',
      reservado_lead_id: u.reservado_lead_id ?? 0,
      reserva_expira_em: u.reserva_expira_em,
      reservado_por: u.reservado_por,
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
          reservas={reservas}
          clientes={clientes ?? []}
          taxas={taxas ?? []}
          vendasRecentes={vendasFmt}
          segmento={empresa?.segmento ?? null}
          fornecedores={fornecedores ?? []}
          isAdmin={isAdmin}
        documentos={documentos} />
      </div>
    </>
  )
}
