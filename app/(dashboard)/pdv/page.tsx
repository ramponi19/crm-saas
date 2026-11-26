import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { documentosDisponiveis } from '@/lib/contrato-emitir'
import { TOLERANCIA_PADRAO } from '@/lib/troca-referencia'
import { Topbar } from '@/components/layout/topbar'
import PDVView from './components/pdv-view'
import type { EncomendaPDV } from '@/components/modules/pdv/encomendas-abertas'
import type { Tables } from '@/types/database'
import { comNome } from '@/lib/sem-nome'
import { capacidades, carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { HREF_CELULARES } from '@/components/modules/celulares/modulo'
import { ENCOMENDA_CELULAR } from '@/components/modules/celulares/rotulos'
import { consultaClientes } from '@/lib/clientes'
import { embedLead } from '@/lib/leads'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { agora, inicioDoDiaHaDias } from '@/lib/datas'
import { DIAS_DA_MEDIANA, medianasPorProduto, referenciaDoProduto } from '@/lib/valor-abaixo-do-catalogo'
import { contextoDaSessao, temPermissao } from '@/lib/sessao'
import { JUNCAO_CUSTO_VENDA, custoDaVenda } from '@/lib/custo'
import { valoresDaTroca } from '@/lib/troca-referencia'

export const metadata = { title: 'PDV' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

const SELECT_RESERVA: string = 'id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_venda, status, fotos_urls, observacoes, reservado_lead_id, reservado_por, reserva_expira_em, produtos:estoque_produtos!produto_id(nome, preco, garantia_dias, foto_url, marcas_produtos:estoque_marcas!marca_id(nome)), '
  + embedLead('inventario_unidades_reservado_lead_id_fkey')

export default async function PDVPage() {
  const [supabase, empresaId, ctx] = await Promise.all([createClient(), getEmpresaId(), contextoDaSessao()])
  /**
   * CUSTO PROTEGIDO (etapa 1.1e): o PDV não lê custo de unidade nem de venda — o custo da venda é o gatilho do banco
   * que grava, a partir da unidade. A única leitura é o custo das encomendas em aberto (o lápis do ajuste), e só
   * com `estoque.ver_custo`: sem ela o servidor nem pede a junção e a tela não recebe custo nenhum.
   */
  const verCusto = temPermissao(ctx, 'estoque.ver_custo')

  // Expiração preguiçosa das reservas de lead (48h): vencida volta a disponível.
  await supabase
    .from('estoque_unidades')
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
    cfgEmpresa,
    { data: tabelaPrecos },
    { data: cfgTroca },
    { data: encomendasRaw },
  ] = await Promise.all([
    supabase
      .from('estoque_unidades')
      // `quantidade` = saldo do lote (item sem série). `tipo_formulario` da
      // categoria diz se o item é vendido por peça ou por quantidade.
      .select('id, produto_id, imei, numero_serie, cor, armazenamento, bateria, condicao, estado, preco_venda, status, quantidade, fotos_urls, observacoes, produtos:estoque_produtos!produto_id(nome, preco, garantia_dias, foto_url, marcas_produtos:estoque_marcas!marca_id(nome), categorias_produtos:estoque_categorias!categoria_id(tipo_formulario))')
      .eq('empresa_id', empresaId)
      .eq('ativo', true).eq('status', 'disponivel')
      .order('created_at', { ascending: false }),
    // Reservas de lead ativas (aba Reservas do PDV). O lead é o negócio; o nome, do contato.
    supabase
      .from('estoque_unidades')
      .select(SELECT_RESERVA)
      .eq('empresa_id', empresaId)
      .eq('ativo', true).eq('status', 'reservado')
      .not('reservado_lead_id', 'is', null)
      .order('reserva_expira_em', { ascending: true }),
    consultaClientes(supabase, 'id, nome, telefone, cpf_cnpj').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('financeiro_taxas').select('*').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('vendas_vendas')
      .select('id, valor_venda, forma_pagamento, data_venda, status, clientes:contatos!cliente_id(nome), produtos:estoque_produtos!produto_id(nome)')
      .eq('empresa_id', empresaId)
      .order('data_venda', { ascending: false }).limit(20),
    carregarConfigEmpresa(supabase, empresaId ?? 0),
    // Referência de preço do aparelho recebido em troca + a tolerância da loja.
    supabase.from('estoque_tabela_precos').select('modelo, armazenamento, condicao, preco_sugerido')
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
     * O embed de `vendas_pagamentos` traz o sinal já pago (e, pela forma `troca`, o valor dado pelo aparelho da
     * entrada); o de `pedidos_compra`, se a peça chegou. O custo vem do satélite e só com a permissão.
     */
    supabase.from('vendas_vendas')
      .select(`id, produto_id, valor_venda, ${verCusto ? `${JUNCAO_CUSTO_VENDA}, ` : ''}previsao_entrega, status, observacoes, unidade_id, data_venda, grupo_pdv, cliente_id, clientes:contatos!cliente_id(nome, telefone), produtos:estoque_produtos!produto_id(nome, preco), pedidos_compra:compras_pedidos!pedido_compra_id(id, status, fornecedor_id, solicitado_em), vendas_pagamentos(id, valor_pago, forma_pagamento)` as string)
      .eq('empresa_id', empresaId)
      .in('status', ['encomenda', 'pendente_entrega'])
      .order('previsao_entrega', { ascending: true, nullsFirst: false }),
  ])

  /**
   * A REFERÊNCIA DO AVISO DE VALOR (17/11/2026): sem preço no catálogo, a mediana das vendas do produto nos
   * últimos 90 dias (só com 5 ou mais). Calculada aqui, uma vez, para o PDV, a encomenda nova e o ajuste.
   */
  const fuso = await fusoDaEmpresa(supabase, empresaId)
  const { data: vendas90 } = await supabase.from('vendas_vendas')
    .select('produto_id, valor_venda, quantidade')
    .eq('empresa_id', empresaId!)
    .not('produto_id', 'is', null).gt('valor_venda', 0).neq('status', 'cancelada')
    .gte('data_venda', inicioDoDiaHaDias(DIAS_DA_MEDIANA, agora(), fuso).toISOString())
  const medianas = medianasPorProduto((vendas90 ?? []) as { produto_id: number | null; valor_venda: number | null; quantidade: number | null }[])

  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    user ? supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  // Quem compra e quem marca "pedido feito" — o vendedor ve a etapa, nao o botao.
  const role = (vinculo as { role?: string } | null)?.role
  const isAdmin = !!((usuario as { is_super_admin?: boolean } | null)?.is_super_admin || role === 'owner' || role === 'admin')

  const documentos = await documentosDisponiveis(supabase, empresaId!)

  /**
   * OS APARELHOS QUE ENTRARAM COMO ENTRADA das encomendas abertas.
   *
   * Amarrados pelo `grupo_pdv` — o mesmo que junta os itens da encomenda. Sem
   * trazer isto, o aparelho existiria no estoque e não na tela onde a encomenda
   * vive, e o vendedor não teria como conferir na frente do cliente o que foi
   * entregue na entrada.
   *
   * O VALOR de cada aparelho não vem mais do `preco_custo` da unidade (custo, protegido, e muda depois): vem do
   * pagamento em troca do grupo (`vendas_pagamentos`, forma `troca`), que é o que o cliente recebeu (roteiro C2).
   */
  const gruposAbertos = [...new Set(
    ((encomendasRaw ?? []) as unknown as { grupo_pdv: string | null }[])
      .map((v) => v.grupo_pdv).filter((g): g is string => !!g),
  )]
  const { data: trocasRaw } = gruposAbertos.length > 0
    ? await supabase.from('estoque_unidades')
        .select('id, grupo_pdv, imei, observacoes, status')
        .eq('empresa_id', empresaId).eq('tipo', 'troca').eq('ativo', true)
        .in('grupo_pdv', gruposAbertos)
        .order('id')
    : { data: [] }

  type UnidadeRow = Tables<'estoque_unidades'> & {
    produtos: Embed<{
      nome: string | null; preco: number | null; garantia_dias: number | null; foto_url: string | null
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
      produto_referencia: referenciaDoProduto(prod?.preco, u.produto_id != null ? medianas[u.produto_id] : null),
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
      produto_referencia: referenciaDoProduto(prod?.preco, u.produto_id != null ? medianas[u.produto_id] : null),
      marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '—',
      lead_nome: one(u.leads)?.nome ?? '—',
      reservado_lead_id: u.reservado_lead_id ?? 0,
      reserva_expira_em: u.reserva_expira_em,
      reservado_por: u.reservado_por,
    }
  })

  type VendaRow = Tables<'vendas_vendas'> & {
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
    id: number; produto_id: number | null; valor_venda: number | null; grupo_pdv: string | null; cliente_id: number | null
    previsao_entrega: string | null; status: string | null; observacoes: string | null
    unidade_id: number | null; data_venda: string | null
    clientes: Embed<{ nome: string | null; telefone: string | null }>
    produtos: Embed<{ nome: string | null; preco: number | null }>
    pedidos_compra: Embed<{ id: number; status: string | null; fornecedor_id: number | null; solicitado_em: string | null }>
    vendas_pagamentos: { id: number; valor_pago: number | null; forma_pagamento: string | null }[] | null
    /** Satélite do custo: só vem com `estoque.ver_custo`. */
    custo?: Embed<{ valor_custo: number | null }>
  }
  // Módulo Celulares ligado: a troca de aparelho, o IMEI e os textos de celular no PDV.
  const celulares = ligadosDaEmpresa(cfgEmpresa).has(HREF_CELULARES)
  const trocaSemDescricao = celulares ? ENCOMENDA_CELULAR.trocaSemDescricao : 'Item'
  // O que foi pago em troca, por grupo, na ordem de gravação (a linha fica na venda que recebeu o sinal; o grupo junta).
  const pagoEmTrocaPorGrupo = new Map<string, { id: number; valor: number }[]>()
  for (const v of (encomendasRaw ?? []) as unknown as EncomendaRow[]) {
    if (!v.grupo_pdv) continue
    for (const p of v.vendas_pagamentos ?? []) {
      if (p.forma_pagamento !== 'troca') continue
      pagoEmTrocaPorGrupo.set(v.grupo_pdv, [...(pagoEmTrocaPorGrupo.get(v.grupo_pdv) ?? []), { id: p.id, valor: Number(p.valor_pago) || 0 }])
    }
  }
  const unidadesTrocaPorGrupo = new Map<string, { imei: string | null; observacoes: string | null }[]>()
  for (const t of (trocasRaw ?? []) as { grupo_pdv: string | null; imei: string | null; observacoes: string | null }[]) {
    if (!t.grupo_pdv) continue
    unidadesTrocaPorGrupo.set(t.grupo_pdv, [...(unidadesTrocaPorGrupo.get(t.grupo_pdv) ?? []), t])
  }
  const trocaPorGrupo = new Map<string, { descricao: string; imei: string | null; valor: number }[]>()
  for (const [grupo, unidadesTroca] of unidadesTrocaPorGrupo) {
    const pagos = (pagoEmTrocaPorGrupo.get(grupo) ?? []).sort((a, b) => a.id - b.id).map((p) => p.valor)
    const valores = valoresDaTroca(unidadesTroca.length, pagos)
    trocaPorGrupo.set(grupo, unidadesTroca.map((t, i) => ({
      // A descricao mora antes do travessao: "iPhone 13 128GB — entrada da encomenda de Fulano."
      descricao: (t.observacoes ?? '').split(' — ')[0] || trocaSemDescricao,
      imei: t.imei,
      valor: valores[i] ?? 0,
    })))
  }

  const encomendas: EncomendaPDV[] = ((encomendasRaw ?? []) as unknown as EncomendaRow[]).map((v) => {
    const ped = one(v.pedidos_compra)
    return {
      id: v.id,
      grupo_pdv: v.grupo_pdv,
      cliente_id: v.cliente_id,
      trocas: v.grupo_pdv ? (trocaPorGrupo.get(v.grupo_pdv) ?? []) : [],
      cliente_nome: one(v.clientes)?.nome ?? 'Sem cliente',
      cliente_telefone: one(v.clientes)?.telefone ?? null,
      // O nome do produto vem do cadastro quando existe; senão, do texto que o
      // vendedor digitou ("Encomenda: iPhone 17 256GB Lavanda."), que é o caso
      // de produto que a loja ainda não cadastrou.
      produto_nome: one(v.produtos)?.nome
        ?? (v.observacoes?.replace(/^Encomenda:\s*/i, '').split('.')[0]?.trim() || 'Produto não identificado'),
      valor_venda: Number(v.valor_venda) || 0,
      // null = sem a permissão (a junção nem foi pedida) ou custo pendente.
      custo: verCusto ? custoDaVenda(v) : null,
      referencia: referenciaDoProduto(one(v.produtos)?.preco, v.produto_id != null ? medianas[v.produto_id] : null),
      previsao_entrega: v.previsao_entrega,
      status: v.status ?? 'encomenda',
      unidade_id: v.unidade_id,
      lancada_em: v.data_venda,
      pedido_id: ped?.id ?? null,
      status_pedido: ped?.status ?? null,
      tem_fornecedor: ped?.fornecedor_id != null,
      solicitado_em: ped?.solicitado_em ?? null,
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
          clientes={((clientes ?? []) as { id: number; nome: string | null; telefone: string | null; cpf_cnpj: string | null }[]).map(comNome)}
          taxas={taxas ?? []}
          vendasRecentes={vendasFmt}
          usaComanda={!!capacidades(cfgEmpresa).usaComanda}
          celulares={celulares}
          tabelaPrecos={(tabelaPrecos ?? []) as { modelo: string; armazenamento: string | null; condicao: string; preco_sugerido: number }[]}
          toleranciaTroca={Number((cfgTroca?.valor as { tolerancia_percentual?: unknown } | null)?.tolerancia_percentual ?? TOLERANCIA_PADRAO)}
          encomendas={encomendas}
          medianas={medianas}
          isAdmin={isAdmin}
          verCusto={verCusto}
        documentos={documentos} />
      </div>
    </>
  )
}
