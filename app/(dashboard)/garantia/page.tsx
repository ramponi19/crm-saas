import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { documentosDisponiveis } from '@/lib/contrato-emitir'
import GarantiaView from './components/garantia-view'
import type { VendaTermo } from './components/termos-view'

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function GarantiaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: garantias }, { data: termosRaw }] = await Promise.all([
    supabase
      .from('garantias_assistencias')
      .select(`
        *,
        clientes(nome, telefone),
        produtos(nome)
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
        venda:vendas!venda_id(
          id, data_venda, valor_venda, cliente_id, numero_serie, forma_pagamento,
          parcelas, desconto_valor, quantidade, observacoes, grupo_pdv,
          clientes!cliente_id(nome, telefone),
          produtos!produto_id(nome),
          vendedor:usuarios!vendedor_id(nome)
        )
      `)
      .eq('empresa_id', empresaId)
      .order('criado_em', { ascending: false })
      .limit(300),
  ])

  const documentos = await documentosDisponiveis(supabase, empresaId!)

  type VendaEmbed = {
    id: number; data_venda: string | null; valor_venda: number; cliente_id: number | null
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

  // Aparelhos recebidos em troca, para o termo de entrega do usado ter conteúdo.
  // Vêm do estoque, pelo `grupo_pdv` do fechamento — é o vínculo que liga a
  // unidade recebida à venda que a trouxe.
  const gruposTroca = [...new Set(
    linhasTermo.filter((t) => t.tipo === 'troca').map((t) => one(t.venda)?.grupo_pdv).filter((g): g is string => !!g),
  )]
  const trocasPorGrupo = new Map<string, { aparelho: string; imei: string | null; valor: number }[]>()
  if (gruposTroca.length) {
    const { data: unidades } = await supabase
      .from('inventario_unidades')
      .select('grupo_pdv, imei, preco_custo, observacoes')
      .eq('empresa_id', empresaId).eq('tipo', 'troca').in('grupo_pdv', gruposTroca)
    for (const u of (unidades ?? []) as { grupo_pdv: string | null; imei: string | null; preco_custo: number | null; observacoes: string | null }[]) {
      if (!u.grupo_pdv) continue
      if (!trocasPorGrupo.has(u.grupo_pdv)) trocasPorGrupo.set(u.grupo_pdv, [])
      trocasPorGrupo.get(u.grupo_pdv)!.push({
        // A observação começa com a descrição digitada no PDV, antes do " — ".
        aparelho: (u.observacoes ?? '').split(' — ')[0]?.trim() || 'Aparelho recebido em troca',
        imei: u.imei,
        valor: Number(u.preco_custo) || 0,
      })
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
      garantias={garantias ?? []}
      termos={termos}
      documentos={documentos}
      empresaId={empresaId!}
    />
  )
}
