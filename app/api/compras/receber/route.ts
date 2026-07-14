import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Marca um pedido de compra como RECEBIDO e dá ENTRADA da unidade no estoque
 * (controle/segurança). Se o pedido for de uma ENCOMENDA (venda vinculada), a
 * unidade entra como 'reservado' e é ligada à venda — que baixa ao finalizar.
 */
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { pedidoId } = (await req.json().catch(() => ({}))) as { pedidoId?: number }
  if (!pedidoId) return NextResponse.json({ error: 'Pedido ausente' }, { status: 400 })

  const { data: pedido } = await supabase.from('pedidos_compra')
    .select('id, status, descricao, valor_total').eq('id', pedidoId).eq('empresa_id', empresaId).maybeSingle()
  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (pedido.status === 'recebido') return NextResponse.json({ ok: true, jaRecebido: true })

  // Encomenda vinculada a este pedido?
  const { data: venda } = await supabase.from('vendas')
    .select('id, unidade_id, produto_id, valor_venda').eq('pedido_compra_id', pedidoId).eq('status', 'encomenda').maybeSingle()

  // Entrada da unidade no estoque (com o produto/preço da encomenda quando houver).
  const { data: unidade } = await supabase.from('inventario_unidades').insert({
    empresa_id: empresaId,
    produto_id: venda?.produto_id ?? null,
    condicao: 'novo',
    tipo: 'compra',
    status: venda ? 'reservado' : 'disponivel',
    preco_custo: pedido.valor_total ?? null,
    preco_venda: venda?.valor_venda ?? null,
    observacoes: `Entrada por compra #${pedido.id}${pedido.descricao ? ` — ${pedido.descricao}` : ''}.`,
    ativo: true,
  } as never).select('id').single()

  await supabase.from('pedidos_compra').update({ status: 'recebido' } as never).eq('id', pedidoId)

  const unidadeId = (unidade as { id?: number } | null)?.id ?? null
  if (venda && unidadeId && !venda.unidade_id) {
    await supabase.from('vendas').update({ unidade_id: unidadeId } as never).eq('id', venda.id)
  }

  return NextResponse.json({ ok: true, unidadeId, encomenda: !!venda })
}
