import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

// Pedido transacional do cardápio (público). Recalcula preços pelo banco.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id').eq('slug', slug).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404, headers: CORS })

  const b = (await req.json().catch(() => ({}))) as { mesa?: string; cliente_nome?: string; observacoes?: string; itens?: { produto_id: number; qtd: number }[] }
  const pedidos = (b.itens ?? []).filter((i) => i.produto_id && (i.qtd ?? 0) > 0)
  if (pedidos.length === 0) return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400, headers: CORS })

  const ids = [...new Set(pedidos.map((i) => i.produto_id))]
  const { data: prods } = await svc.from('produtos').select('id, nome, preco, disponivel').eq('empresa_id', empresa.id).in('id', ids)
  const prodMap = new Map((prods ?? []).map((p) => [p.id, p]))

  const itens: { produto_id: number; nome: string; preco: number; qtd: number }[] = []
  let total = 0
  for (const i of pedidos) {
    const p = prodMap.get(i.produto_id)
    if (!p || p.disponivel === false) continue
    const qtd = Math.min(99, Math.max(1, Math.floor(i.qtd)))
    const preco = Number(p.preco) || 0
    itens.push({ produto_id: p.id, nome: p.nome, preco, qtd })
    total += preco * qtd
  }
  if (itens.length === 0) return NextResponse.json({ error: 'Itens indisponíveis' }, { status: 400, headers: CORS })

  const { data: pedido, error } = await svc.from('pedidos').insert({
    empresa_id: empresa.id, mesa: (b.mesa || '').trim() || null, cliente_nome: (b.cliente_nome || '').trim() || null,
    itens: itens as never, total, status: 'recebido', observacoes: (b.observacoes || '').trim() || null, origem: 'cardapio',
  }).select('id').single()
  if (error || !pedido) return NextResponse.json({ error: 'Falha ao enviar pedido' }, { status: 500, headers: CORS })

  return NextResponse.json({ ok: true, numero: pedido.id }, { status: 200, headers: CORS })
}
