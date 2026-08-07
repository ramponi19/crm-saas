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
    // Vendas marcadas no PDV como "termo a assinar". `not is null` traz as duas
    // situações (pendente e assinado) — o histórico do que já voltou também
    // interessa, é a prova de que o papel existe.
    supabase
      .from('vendas')
      .select(`
        id, data_venda, valor_venda, cliente_id, produto_id, numero_serie, forma_pagamento,
        parcelas, desconto_valor, quantidade, observacoes,
        termo_garantia, termo_garantia_em,
        clientes!cliente_id(nome, telefone),
        produtos!produto_id(nome),
        vendedor:usuarios!vendedor_id(nome),
        anexou:usuarios!termo_garantia_por(nome)
      `)
      .eq('empresa_id', empresaId)
      .not('termo_garantia', 'is', null)
      .order('data_venda', { ascending: false })
      .limit(300),
  ])

  const documentos = await documentosDisponiveis(supabase, empresaId!)

  type TermoRow = {
    id: number; data_venda: string | null; valor_venda: number; cliente_id: number | null
    numero_serie: string | null; forma_pagamento: string | null; parcelas: number | null
    desconto_valor: number | null; quantidade: number | null; observacoes: string | null
    termo_garantia: string | null; termo_garantia_em: string | null
    clientes: Embed<{ nome: string | null; telefone: string | null }>
    produtos: Embed<{ nome: string | null }>
    vendedor: Embed<{ nome: string | null }>
    anexou: Embed<{ nome: string | null }>
  }

  const termos: VendaTermo[] = ((termosRaw ?? []) as unknown as TermoRow[]).map((v) => {
    const cli = one(v.clientes)
    return {
      id: v.id,
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
      termo_garantia: v.termo_garantia,
      termo_garantia_em: v.termo_garantia_em,
      anexado_por: one(v.anexou)?.nome ?? null,
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
