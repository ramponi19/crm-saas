import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { AVARIA_POR_CHAVE, BONUS_LEVA_SEMINOVO, calcularTroca } from '@/lib/troca-avarias'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'
import { TOTAL_ITENS } from '@/lib/troca-checklist'

/**
 * Grava a cotação de troca.
 *
 * ══ A CONTA É REFEITA AQUI, DO ZERO ════════════════════════════════════════
 *
 * A tela manda o que foi marcado; o VALOR sai da matriz do banco, recalculado
 * por `calcularTroca` — a mesma função que a tela usa para mostrar ao vivo.
 * Aceitar o total que veio no corpo faria o preço de compra da loja ser
 * definido pelo navegador do cliente.
 *
 * ══ E OS VALORES FICAM CONGELADOS NA LINHA ═════════════════════════════════
 *
 * `na_troca`, `descontos_total`, `bonus` e `valor_final` são copiados para a
 * cotação, não lidos por referência da matriz. Reajustar a tabela na semana que
 * vem não pode reescrever o que já foi prometido ao cliente.
 */

interface Body {
  id?: number
  modelo?: string
  armazenamento?: string
  imei?: string
  cliente_nome?: string
  cliente_id?: number | null
  lead_id?: number | null
  avarias?: string[]
  /** { '1': true, '5': true } — só os itens verificados. */
  checklist?: Record<string, boolean>
  observacoes?: string
  status?: string
}

const STATUS = ['rascunho', 'fechada', 'descartada']

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await cotacaoDeTrocaLiberada())) return NextResponse.json({ error: 'Módulo não liberado' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as Body
  const modelo = (b.modelo || '').trim()
  if (!modelo) return NextResponse.json({ error: 'Escolha o aparelho' }, { status: 400 })
  const armazenamento = (b.armazenamento || '').trim()

  // Chave desconhecida é descartada em silêncio: avaria removida do produto não
  // pode impedir de salvar uma cotação, só de descontar.
  const marcadas = [...new Set(b.avarias ?? [])]
    .filter((c) => AVARIA_POR_CHAVE[c] || c === BONUS_LEVA_SEMINOVO.chave)

  const [{ data: preco }, { data: regras }] = await Promise.all([
    supabase.from('troca_precos')
      .select('na_troca, descontos')
      .eq('empresa_id', empresaId).eq('modelo', modelo).eq('armazenamento', armazenamento)
      .eq('ativo', true).maybeSingle(),
    supabase.from('troca_regras').select('bonus_seminovo').eq('empresa_id', empresaId).maybeSingle(),
  ])

  /**
   * Sem base na matriz, não há cotação.
   *
   * Salvar com base zero gravaria "este aparelho vale R$ 0,00" — e um dia
   * alguém leria isso como preço praticado, não como cadastro faltando.
   */
  if (preco?.na_troca == null) {
    return NextResponse.json(
      { error: `Sem valor de troca cadastrado para ${modelo} ${armazenamento}`.trim() },
      { status: 400 },
    )
  }

  const conta = calcularTroca(
    Number(preco.na_troca) || 0,
    (preco.descontos ?? {}) as Record<string, unknown>,
    marcadas,
    Number(regras?.bonus_seminovo) || 0,
  )

  // Só itens que existem no roteiro, e só os marcados: o objeto guardado é o
  // que foi conferido, não um mapa de 26 booleanos com 20 falsos.
  const checklist: Record<string, boolean> = {}
  for (const [n, ok] of Object.entries(b.checklist ?? {})) {
    const i = Number(n)
    if (Number.isInteger(i) && i >= 1 && i <= TOTAL_ITENS && ok) checklist[n] = true
  }

  // Cadastro vem do cliente: id de outro tenant gravaria a cotação apontando
  // para quem não foi atendido. Não é da empresa → nulo, o nome digitado vale.
  let clienteId: number | null = null
  if (b.cliente_id != null) {
    const { data: cli } = await supabase.from('clientes')
      .select('id').eq('id', b.cliente_id).eq('empresa_id', empresaId).maybeSingle()
    clienteId = cli?.id ?? null
  }
  let leadId: number | null = null
  if (b.lead_id != null) {
    const { data: ld } = await supabase.from('leads')
      .select('id').eq('id', b.lead_id).eq('empresa_id', empresaId).maybeSingle()
    leadId = ld?.id ?? null
  }

  const dados = {
    empresa_id: empresaId,
    modelo,
    armazenamento,
    imei: b.imei?.replace(/\D/g, '') || null,
    cliente_nome: b.cliente_nome?.trim() || null,
    cliente_id: clienteId,
    lead_id: leadId,
    avarias: marcadas as never,
    na_troca: conta.base,
    descontos_total: conta.descontos,
    bonus: conta.bonus,
    valor_final: conta.total,
    checklist: checklist as never,
    observacoes: b.observacoes?.trim() || null,
    status: STATUS.includes(b.status || '') ? b.status! : 'rascunho',
  }

  if (b.id) {
    const { error } = await supabase.from('troca_cotacoes').update(dados as never).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: b.id, ...conta })
  }

  // `usuario_id` só na criação, como em orçamentos: é o dono da cotação, e o
  // admin que corrigir uma vírgula não pode virar dono dela.
  const { data, error } = await supabase.from('troca_cotacoes')
    .insert({ ...dados, usuario_id: user.id } as never)
    .select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, ...conta })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })
  // RLS decide o que este usuário alcança — a cláusula de empresa/loja está na
  // política, não aqui.
  const { error } = await supabase.from('troca_cotacoes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
