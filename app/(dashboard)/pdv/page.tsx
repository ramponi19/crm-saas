import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { documentosDisponiveis } from '@/lib/contrato-emitir'
import { TOLERANCIA_PADRAO } from '@/lib/troca-referencia'
import { Topbar } from '@/components/layout/topbar'
import PDVView from './components/pdv-view'
import type { EncomendaPDV } from '@/components/modules/pdv/encomendas-abertas'
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
    { data: tabelaPrecos },
    { data: cfgTroca },
    { data: encomendasRaw },
  ] = await Promise.all([
    supabase
      .from('inventario_unidades')
      // `quantidade` = saldo do lote (item sem série). `tipo_formulario` da
      // categoria diz se o item é vendido por peça ou por quantidade.
      .select('id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_custo, preco_venda, status, quantidade, fotos_urls, observacoes, produtos!produto_id(nome, garantia_dias, foto_url, marcas_produtos!marca_id(nome), categorias_produtos!categoria_id(tipo_formulario))')
      .eq('empresa_id', empresaId)
      .eq('ativo', true).eq('status', 'disponivel')
      .order('created_at', { ascending: false }),
    // Reservas de lead ativas (aba Reservas do PDV).
    supabase
      .from('inventario_unidades')
      .select('id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_custo, preco_venda, status, fotos_urls, observacoes, reservado_lead_id, reservado_por, reserva_expira_em, produtos!produto_id(nome, garantia_dias, foto_url, marcas_produtos!marca_id(nome)), leads!reservado_lead_id(nome)')
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
    // Referência de preço do aparelho recebido em troca + a tolerância da loja.
    supabase.from('tabela_precos').select('modelo, armazenamento, condicao, preco_sugerido')
      .eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('configuracoes_sistema').select('valor')
      .eq('empresa_id', empresaId).eq('chave', 'troca').maybeSingle(),
    /**
     * ENCOMENDAS EM ABERTO — a aba nova do PDV.
     *
     * Sem limite de propósito: é uma lista de pendências, não um histórico. As
     * três da JM estavam paradas há 28, 21 e 1 dia sem ninguém ver — cortar a
     * lista seria recriar o problema com outro nome.
     *
     * O embed de `vendas_pagamentos` traz o sinal já pago; o de
     * `pedidos_compra`, se a peça chegou.
     */
    supabase.from('vendas')
      .select('id, valor_venda, valor_custo, previsao_entrega, status, observacoes, unidade_id, data_venda, clientes!cliente_id(nome, telefone), produtos!produto_id(nome), pedidos_compra!pedido_compra_id(id, status, fornecedor_id), vendas_pagamentos(valor_pago)')
      .eq('empresa_id', empresaId)
      .in('status', ['encomenda', 'pendente_entrega'])
      .order('previsao_entrega', { ascending: true, nullsFirst: false }),
  ])

  const documentos = await documentosDisponiveis(supabase, empresaId!)

  const role = (vinculoRes?.data as { role?: string } | null)?.role
  const isAdmin = !!((usuarioRes?.data as { is_super_admin?: boolean } | null)?.is_super_admin || role === 'owner' || role === 'admin')

  type UnidadeRow = Tables<'inventario_unidades'> & {
    produtos: Embed<{
      nome: string | null; garantia_dias: number | null; foto_url: string | null
      marcas_produtos: Embed<{ nome: string | null }>
      categorias_produtos: Embed<{ tipo_formulario: string | null }>
    }>
  }
  const itens = ((unidades ?? []) as unknown as UnidadeRow[]).map(u => {
    const prod = one(u.produtos)
    return {
      ...u,
      produto_id: u.produto_id ?? null,
      status: u.status ?? 'disponivel',
      produto_nome: prod?.nome ?? (u.observacoes?.split(' (cliente')[0]?.trim() || '—'),
      produto_garantia_dias: prod?.garantia_dias ?? null,
      produto_foto: prod?.foto_url ?? null,
      marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '—',
      quantidade: u.quantidade ?? 1,
      tipo_formulario: one(prod?.categorias_produtos ?? null)?.tipo_formulario ?? null,
    }
  })

  type ReservaRow = UnidadeRow & { leads: Embed<{ nome: string | null }> }
  const reservas = ((reservadas ?? []) as unknown as ReservaRow[]).map(u => {
    const prod = one(u.produtos)
    return {
      ...u,
      produto_id: u.produto_id ?? null,
      status: u.status ?? 'reservado',
      produto_nome: prod?.nome ?? (u.observacoes?.split(' (cliente')[0]?.trim() || '—'),
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

  type EncomendaRow = {
    id: number; valor_venda: number | null; valor_custo: number | null
    previsao_entrega: string | null; status: string | null; observacoes: string | null
    unidade_id: number | null; data_venda: string | null
    clientes: Embed<{ nome: string | null; telefone: string | null }>
    produtos: Embed<{ nome: string | null }>
    pedidos_compra: Embed<{ id: number; status: string | null; fornecedor_id: number | null }>
    vendas_pagamentos: { valor_pago: number | null }[] | null
  }
  const encomendas: EncomendaPDV[] = ((encomendasRaw ?? []) as unknown as EncomendaRow[]).map((v) => {
    const ped = one(v.pedidos_compra)
    return {
      id: v.id,
      cliente_nome: one(v.clientes)?.nome ?? 'Sem cliente',
      cliente_telefone: one(v.clientes)?.telefone ?? null,
      // O nome do produto vem do cadastro quando existe; senão, do texto que o
      // vendedor digitou ("Encomenda: iPhone 17 256GB Lavanda."), que é o caso
      // de produto que a loja ainda não cadastrou.
      produto_nome: one(v.produtos)?.nome
        ?? (v.observacoes?.replace(/^Encomenda:\s*/i, '').split('.')[0]?.trim() || 'Produto não identificado'),
      valor_venda: Number(v.valor_venda) || 0,
      valor_custo: Number(v.valor_custo) || 0,
      previsao_entrega: v.previsao_entrega,
      status: v.status ?? 'encomenda',
      unidade_id: v.unidade_id,
      lancada_em: v.data_venda,
      pedido_id: ped?.id ?? null,
      status_pedido: ped?.status ?? null,
      tem_fornecedor: ped?.fornecedor_id != null,
      // Somado aqui, no servidor: a lista só precisa do total já pago.
      sinal_pago: (v.vendas_pagamentos ?? []).reduce((s, p) => s + (Number(p.valor_pago) || 0), 0),
    }
  })

  return (
    <>
      <Topbar eyebrow="VENDAS" title="PDV — Ponto de Venda" />
      {/* Precisa ser coluna FLEX: o container de rolagem do PDV usa `flex-1`, e
          num pai block ele ignora o limite e cresce até o conteúdo. O pai então
          corta o excedente com overflow-hidden e nada rola — só aparecia com a
          janela restaurada, porque maximizada o conteúdo caberia. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PDVView
          itensDisponiveis={itens}
          reservas={reservas}
          clientes={clientes ?? []}
          taxas={taxas ?? []}
          vendasRecentes={vendasFmt}
          segmento={empresa?.segmento ?? null}
          fornecedores={fornecedores ?? []}
          isAdmin={isAdmin}
          tabelaPrecos={(tabelaPrecos ?? []) as { modelo: string; armazenamento: string | null; condicao: string; preco_sugerido: number }[]}
          toleranciaTroca={Number((cfgTroca?.valor as { tolerancia_percentual?: unknown } | null)?.tolerancia_percentual ?? TOLERANCIA_PADRAO)}
          encomendas={encomendas}
        documentos={documentos} />
      </div>
    </>
  )
}
