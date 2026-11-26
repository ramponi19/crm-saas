import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { documentosDisponiveis } from '@/lib/contrato-emitir'
import GarantiaView from './components/garantia-view'
import type { VendaTermo } from './components/termos-view'
import { comNomeDoCliente } from '@/lib/sem-nome'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { rotulosGarantia } from './rotulos'
import { dataDeEntrega } from '@/lib/data-entrega'
import { valoresDaTroca } from '@/lib/troca-referencia'

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function GarantiaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: garantias }, { data: termosRaw }, cfg] = await Promise.all([
    supabase
      .from('assistencia_garantias')
      .select(`
        *,
        clientes:contatos!cliente_id(nome, telefone),
        produtos:estoque_produtos(nome)
      `)
      .eq('empresa_id', empresaId)
      .eq('tipo', 'garantia')
      .order('created_at', { ascending: false }),
    // Termos a assinar da venda. Traz pendentes E assinados — o histórico do que
    // já voltou também interessa, é a prova de que o papel existe.
    supabase
      .from('vendas_termos')
      .select(`
        id, venda_id, tipo, status, assinado_em,
        anexou:usuarios!assinado_por(nome),
        venda:vendas_vendas!venda_id(
          id, data_venda, concluida_em, valor_venda, cliente_id, numero_serie, forma_pagamento,
          parcelas, desconto_valor, quantidade, observacoes, grupo_pdv,
          clientes:contatos!cliente_id(nome, telefone),
          produtos:estoque_produtos!produto_id(nome),
          vendedor:usuarios!vendedor_id(nome)
        )
      `)
      .eq('empresa_id', empresaId)
      .order('criado_em', { ascending: false })
      .limit(300),
    carregarConfigEmpresa(supabase, empresaId!),
  ])
  // "Aparelho recebido em troca" só com o módulo Celulares e aparelhos ligado.
  const rotulos = rotulosGarantia(ligadosDaEmpresa(cfg).has('/check-imei'))

  const documentos = await documentosDisponiveis(supabase, empresaId!)

  type VendaEmbed = {
    id: number; data_venda: string | null; concluida_em: string | null; valor_venda: number; cliente_id: number | null
    numero_serie: string | null; forma_pagamento: string | null; parcelas: number | null
    desconto_valor: number | null; quantidade: number | null; observacoes: string | null
    grupo_pdv: string | null
    clientes: Embed<{ nome: string | null; telefone: string | null }>
    produtos: Embed<{ nome: string | null }>
    vendedor: Embed<{ nome: string | null }>
  }
  type TermoRow = {
    id: number; venda_id: number; tipo: string; status: string; assinado_em: string | null
    anexou: Embed<{ nome: string | null }>
    venda: Embed<VendaEmbed>
  }

  const linhasTermo = ((termosRaw ?? []) as unknown as TermoRow[]).filter((t) => one(t.venda))

  // Itens recebidos em troca, para o termo de entrega do usado ter conteúdo.
  // Vêm do estoque, pelo `grupo_pdv` do fechamento — é o vínculo que liga a
  // unidade recebida à venda que a trouxe.
  //
  // O VALOR de cada aparelho vem do que foi PAGO em troca (`vendas_pagamentos`, forma `troca`, das vendas do grupo),
  // não do `preco_custo` da unidade (etapa 1.1e; roteiro C2): custo é protegido e muda depois (reparo, ajuste), e o
  // termo tem de dizer o que o cliente recebeu no dia.
  const gruposTroca = [...new Set(
    linhasTermo.filter((t) => t.tipo === 'troca').map((t) => one(t.venda)?.grupo_pdv).filter((g): g is string => !!g),
  )]
  const trocasPorGrupo = new Map<string, { aparelho: string; imei: string | null; valor: number }[]>()
  if (gruposTroca.length) {
    const [{ data: unidades }, { data: vendasDoGrupo }] = await Promise.all([
      supabase
        .from('estoque_unidades')
        .select('grupo_pdv, imei, observacoes')
        .eq('empresa_id', empresaId).eq('tipo', 'troca').in('grupo_pdv', gruposTroca)
        .order('id'),
      supabase
        .from('vendas_vendas')
        .select('grupo_pdv, vendas_pagamentos(id, forma_pagamento, valor_pago)')
        .eq('empresa_id', empresaId!).in('grupo_pdv', gruposTroca),
    ])
    // O que foi pago em troca, por grupo, na ordem de gravação.
    const pagoEmTroca = new Map<string, { id: number; valor: number }[]>()
    type VendaPagos = { grupo_pdv: string | null; vendas_pagamentos: { id: number; forma_pagamento: string | null; valor_pago: number | null }[] | null }
    for (const v of (vendasDoGrupo ?? []) as unknown as VendaPagos[]) {
      if (!v.grupo_pdv) continue
      for (const p of v.vendas_pagamentos ?? []) {
        if (p.forma_pagamento !== 'troca') continue
        pagoEmTroca.set(v.grupo_pdv, [...(pagoEmTroca.get(v.grupo_pdv) ?? []), { id: p.id, valor: Number(p.valor_pago) || 0 }])
      }
    }
    const unidadesPorGrupo = new Map<string, { imei: string | null; observacoes: string | null }[]>()
    for (const u of (unidades ?? []) as { grupo_pdv: string | null; imei: string | null; observacoes: string | null }[]) {
      if (!u.grupo_pdv) continue
      unidadesPorGrupo.set(u.grupo_pdv, [...(unidadesPorGrupo.get(u.grupo_pdv) ?? []), u])
    }
    for (const [grupo, lista] of unidadesPorGrupo) {
      const pagos = (pagoEmTroca.get(grupo) ?? []).sort((a, b) => a.id - b.id).map((p) => p.valor)
      const valores = valoresDaTroca(lista.length, pagos)
      trocasPorGrupo.set(grupo, lista.map((u, i) => ({
        // A observação começa com a descrição digitada no PDV, antes do " — ".
        aparelho: (u.observacoes ?? '').split(' — ')[0]?.trim() || rotulos.recebidoEmTroca,
        imei: u.imei,
        valor: valores[i] ?? 0,
      })))
    }
  }

  const termos: VendaTermo[] = linhasTermo.map((t) => {
    const v = one(t.venda)!
    const cli = one(v.clientes)
    return {
      id: t.id,
      venda_id: t.venda_id,
      tipo: t.tipo,
      status: t.status,
      assinado_em: t.assinado_em,
      anexado_por: one(t.anexou)?.nome ?? null,
      trocas: (v.grupo_pdv ? trocasPorGrupo.get(v.grupo_pdv) : undefined) ?? [],
      data_venda: v.data_venda,
      // O termo de garantia é da ENTREGA (lib/data-entrega): encomenda guarda o lançamento em data_venda.
      data_entrega: dataDeEntrega(v),
      valor_venda: Number(v.valor_venda),
      cliente_id: v.cliente_id,
      cliente_nome: cli?.nome ?? null,
      cliente_telefone: cli?.telefone ?? null,
      // Sem cadastro de produto (aparelho de troca, acessório), a descrição vive
      // na observação — mesmo fallback do Histórico.
      produto_nome: one(v.produtos)?.nome ?? v.observacoes ?? null,
      numero_serie: v.numero_serie,
      vendedor_nome: one(v.vendedor)?.nome ?? null,
      forma_pagamento: v.forma_pagamento,
      parcelas: v.parcelas,
      desconto_valor: v.desconto_valor != null ? Number(v.desconto_valor) : null,
      quantidade: v.quantidade,
    }
  })

  return (
    <GarantiaView
      garantias={(garantias ?? []).map(comNomeDoCliente)}
      termos={termos}
      documentos={documentos}
      empresaId={empresaId!}
    />
  )
}
