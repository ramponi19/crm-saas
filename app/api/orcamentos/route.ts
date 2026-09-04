import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface ItemOrc { descricao?: string; qtd?: number; valor?: number }
interface Body {
  id?: number
  tipo?: string
  status?: string
  cliente_nome?: string
  cliente_telefone?: string
  cliente_id?: number | null
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
  acerto?: string
  /** Cotação de troca que originou este orçamento (Upgrade/Downgrade). */
  troca_cotacao_id?: number | null
}

const TIPOS = ['assistencia', 'melhoria', 'downgrade', 'venda']

// Como a loja acerta o saldo que ficou A FAVOR DO CLIENTE num downgrade. Nao ha
// resposta certa: cada negociacao fecha de um jeito, entao as quatro ficam
// disponiveis para o vendedor escolher na hora.
const ACERTOS = ['dinheiro', 'credito', 'produto', 'nenhum']

/** A cotação existe e é desta empresa? Senão, nulo — o nome digitado continua valendo. */
async function cotacaoDaEmpresa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: number,
  id: number | null | undefined,
): Promise<number | null> {
  if (id == null) return null
  const { data } = await supabase.from('troca_cotacoes')
    .select('id').eq('id', id).eq('empresa_id', empresaId).maybeSingle()
  return data?.id ?? null
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Body
  const tipo = TIPOS.includes(b.tipo || '') ? b.tipo! : 'assistencia'
  const nome = (b.cliente_nome || '').trim()
  if (!nome) return NextResponse.json({ error: 'Informe o nome do cliente' }, { status: 400 })

  /**
   * O cadastro vem do cliente, então precisa ser CONFERIDO aqui: um id de outra
   * empresa gravaria o orçamento apontando para o cliente de outro tenant, e a
   * venda gerada na aprovação (que roda com service role, sem RLS) apareceria no
   * histórico de quem não comprou nada. Não é da empresa → grava nulo, o nome
   * digitado continua valendo.
   */
  let clienteId: number | null = null
  if (b.cliente_id != null) {
    const { data: cli } = await supabase.from('clientes')
      .select('id').eq('id', b.cliente_id).eq('empresa_id', empresaId).maybeSingle()
    clienteId = cli?.id ?? null
  }

  const itens = (b.itens ?? [])
    .map((i) => ({ descricao: (i.descricao || '').trim(), qtd: Math.max(1, Number(i.qtd) || 1), valor: Math.max(0, Number(i.valor) || 0) }))
    .filter((i) => i.descricao)

  const itensTotal = itens.reduce((s, i) => s + i.qtd * i.valor, 0)

  // No downgrade a diferença pode cair para qualquer lado, e os itens
  // (acessório, serviço, película) entram do lado do cliente — é assim que se
  // "abate em produto" na negociação.
  //
  // `total` = o que o CLIENTE paga · `devolver` = o que a LOJA acerta com ele.
  // Exclusivos: um dos dois é sempre zero. Guardar os dois separados, em vez de
  // um número com sinal, evita total negativo vazando para relatório e venda.
  const saldo = tipo === 'downgrade'
    ? (Number(b.valor_novo) || 0) + itensTotal - (Number(b.valor_entrada) || 0)
    : itensTotal
  const total = Math.max(0, saldo)
  const devolver = tipo === 'downgrade' ? Math.max(0, -saldo) : 0
  // `acerto` só significa algo quando sobra saldo para o cliente.
  const acerto = devolver > 0
    ? (ACERTOS.includes(b.acerto || '') ? b.acerto! : 'dinheiro')
    : null

  // status só é aplicado quando explicitamente enviado; senão preserva o atual
  // (nunca reverte um orçamento aprovado para rascunho — evita re-aprovação/venda duplicada).
  const statusEnviado = ['rascunho', 'enviado', 'aprovado', 'recusado'].includes(b.status || '') ? b.status! : undefined

  const dados = {
    empresa_id: empresaId,
    lead_id: b.lead_id ?? null,
    cliente_nome: nome,
    cliente_telefone: b.cliente_telefone?.trim() || null,
    cliente_id: clienteId,
    tipo,
    aparelho: b.aparelho?.trim() || null,
    imei: b.imei?.trim() || null,
    defeito: b.defeito?.trim() || null,
    prazo_dias: b.prazo_dias != null ? Math.max(0, Number(b.prazo_dias) || 0) : null,
    garantia_dias: b.garantia_dias != null ? Math.max(0, Number(b.garantia_dias) || 0) : null,
    itens: itens as never,
    aparelho_novo: b.aparelho_novo?.trim() || null,
    valor_novo: tipo === 'downgrade' ? (Number(b.valor_novo) || 0) : null,
    aparelho_usado: b.aparelho_usado?.trim() || null,
    valor_entrada: tipo === 'downgrade' ? (Number(b.valor_entrada) || 0) : null,
    /**
     * A unidade do estoque agora vale para DOWNGRADE também.
     *
     * Era `tipo === 'venda' ? ... : null`, e isso anulava em silêncio o aparelho
     * que SAI num Upgrade/Downgrade — o campo existe justamente para dizer qual
     * peça do estoque está prometida ao cliente. Sem ele, o orçamento sabia o
     * preço mas não a peça, e a reserva não tinha a quem se amarrar.
     *
     * Não muda comportamento nenhum a jusante: a baixa automática pelo link
     * público continua atrás de `tipo === 'venda'` (ver app/api/orcamento/[token]).
     * No Upgrade/Downgrade a venda fecha no PDV, pelo código da cotação.
     */
    unidade_id: tipo === 'venda' || tipo === 'downgrade' ? (b.unidade_id ?? null) : null,
    total,
    valor_devolver: devolver,
    acerto,
    observacoes: b.observacoes?.trim() || null,
    /**
     * O vínculo com a cotação, CONFERIDO — id vindo do cliente aponta para
     * qualquer linha, e um orçamento amarrado à cotação de outro tenant faria o
     * PDV abater um valor que não é deste cliente. Não é da empresa → nulo.
     */
    troca_cotacao_id: await cotacaoDaEmpresa(supabase, empresaId, b.troca_cotacao_id),
  }

  if (b.id) {
    const patch = statusEnviado ? { ...dados, status: statusEnviado } : dados
    const { data, error } = await supabase.from('orcamentos').update(patch).eq('id', b.id).select('id, token').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: b.id, token: data?.token })
  }
  // `usuario_id` só na CRIAÇÃO: é o dono do orçamento, e o escopo por vendedor
  // depende dele. Na edição o dono não muda — senão o admin que corrigisse uma
  // vírgula viraria dono do orçamento do vendedor e sumiria com ele da lista dele.
  const { data, error } = await supabase.from('orcamentos')
    .insert({ ...dados, status: statusEnviado ?? 'rascunho', usuario_id: user.id })
    .select('id, token').single()
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
