import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface ItemOrc { descricao?: string; qtd?: number; valor?: number }
interface Body {
  id?: number
  tipo?: string
  status?: string
  cliente_nome?: string
  cliente_telefone?: string
  lead_id?: number | null
  aparelho?: string
  imei?: string
  defeito?: string
  prazo_dias?: number
  garantia_dias?: number
  itens?: ItemOrc[]
  aparelho_novo?: string
  valor_novo?: number
  aparelho_usado?: string
  valor_entrada?: number
  unidade_id?: number | null
  observacoes?: string
}

const TIPOS = ['assistencia', 'melhoria', 'troca', 'venda']

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Body
  const tipo = TIPOS.includes(b.tipo || '') ? b.tipo! : 'assistencia'
  const nome = (b.cliente_nome || '').trim()
  if (!nome) return NextResponse.json({ error: 'Informe o nome do cliente' }, { status: 400 })

  const itens = (b.itens ?? [])
    .map((i) => ({ descricao: (i.descricao || '').trim(), qtd: Math.max(1, Number(i.qtd) || 1), valor: Math.max(0, Number(i.valor) || 0) }))
    .filter((i) => i.descricao)

  // Total: itens (assistência/melhoria) ou diferença (troca).
  const total = tipo === 'troca'
    ? Math.max(0, (Number(b.valor_novo) || 0) - (Number(b.valor_entrada) || 0))
    : itens.reduce((s, i) => s + i.qtd * i.valor, 0)

  const dados = {
    empresa_id: empresaId,
    lead_id: b.lead_id ?? null,
    cliente_nome: nome,
    cliente_telefone: b.cliente_telefone?.trim() || null,
    tipo,
    status: ['rascunho', 'enviado', 'aprovado', 'recusado'].includes(b.status || '') ? b.status! : 'rascunho',
    aparelho: b.aparelho?.trim() || null,
    imei: b.imei?.trim() || null,
    defeito: b.defeito?.trim() || null,
    prazo_dias: b.prazo_dias != null ? Math.max(0, Number(b.prazo_dias) || 0) : null,
    garantia_dias: b.garantia_dias != null ? Math.max(0, Number(b.garantia_dias) || 0) : null,
    itens: itens as never,
    aparelho_novo: b.aparelho_novo?.trim() || null,
    valor_novo: tipo === 'troca' ? (Number(b.valor_novo) || 0) : null,
    aparelho_usado: b.aparelho_usado?.trim() || null,
    valor_entrada: tipo === 'troca' ? (Number(b.valor_entrada) || 0) : null,
    unidade_id: tipo === 'venda' ? (b.unidade_id ?? null) : null,
    total,
    observacoes: b.observacoes?.trim() || null,
  }

  if (b.id) {
    const { error } = await supabase.from('orcamentos').update(dados).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: b.id })
  }
  const { data, error } = await supabase.from('orcamentos').insert(dados).select('id, token').single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, token: data.token })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })
  const { error } = await supabase.from('orcamentos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
