import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { calcularComissao, calcularComissaoPorPercentual, cashbackCabe, mesclarTaxas, type TaxasComissao } from '@/lib/comissao-imob'

/**
 * Negócio fechado da imobiliária — venda ou locação de um imóvel.
 *
 * Passa pelo servidor, e não por escrita direta do navegador, por dois motivos que
 * a auditoria de 18/08 deixou claros:
 *
 * 1. FECHAR NEGÓCIO MEXE EM DUAS TABELAS. O negócio nasce e o imóvel sai de
 *    'disponivel'. Se a segunda parte falhar, fica um imóvel vendido que continua
 *    aparecendo como disponível para o próximo corretor — foi o que acontecia na
 *    aprovação de orçamento por link antes do conserto.
 * 2. A BAIXA DO IMÓVEL É UM CLAIM. Só sai de disponível quem ainda está
 *    disponível; o índice único do banco barra o segundo negócio, e aqui a resposta
 *    diz POR QUE barrou, em vez de devolver erro cru de constraint.
 */

const TIPOS = ['venda', 'locacao'] as const
const STATUS = ['contrato', 'vistoria', 'entregue', 'finalizado', 'cancelado'] as const

/** Status do imóvel conforme o negócio: venda tira de circulação, locação também. */
const STATUS_IMOVEL_POR_TIPO: Record<string, string> = { venda: 'vendido', locacao: 'alugado' }

interface CorpoNovo {
  imovel_id?: number
  /**
   * 'manual' = comissão lançada à mão, sem imóvel cadastrado nem lead no funil.
   *
   * É como o CRM do dono trabalha: a comissão é o registro, e o imóvel entra como
   * código digitado. Serve para venda antiga, contrato importado e acerto por fora
   * — dinheiro que existe e, sem isto, ficava fora do painel.
   */
  origem?: string
  cliente_nome?: string | null
  imovel_codigo?: string | null
  /** % da comissão combinado NAQUELE negócio (só no lançamento manual). */
  percentual?: number | string
  cashback_percentual?: number | string
  cashback?: number | string
  lead_id?: number | null
  cliente_id?: number | null
  tipo?: string
  valor?: number | string
  captador_id?: string | null
  corretor_id?: string | null
  assinado_em?: string | null
  locacao_inicio?: string | null
  locacao_fim?: string | null
  observacoes?: string | null
}

export async function POST(req: Request) {
  // Corretor fecha o próprio negócio: 'vendedor' entra. Papel de apoio, não.
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor'])
  if (auth.error) return auth.error
  const { empresaId, userId } = auth

  const b = (await req.json().catch(() => ({}))) as CorpoNovo
  const tipo = TIPOS.includes(b.tipo as never) ? (b.tipo as string) : null
  const valor = Number(b.valor)

  if (!tipo) return NextResponse.json({ error: 'Diga se é venda ou locação' }, { status: 400 })
  if (b.origem === 'manual') return lancarComissaoManual(b, tipo, valor, empresaId, userId, auth.role)
  if (!b.imovel_id) return NextResponse.json({ error: 'Escolha o imóvel do negócio' }, { status: 400 })
  /**
   * Valor obrigatório e maior que zero.
   *
   * Negócio de R$ 0,00 é o mesmo furo da encomenda que o teste de ontem pegou: o
   * faturamento soma nada, a comissão sai zerada e ninguém percebe até o corretor
   * cobrar. O valor fechado é o que a imobiliária ACABOU de combinar — se ninguém
   * sabe quanto é, não há negócio para registrar.
   */
  if (!(valor > 0)) return NextResponse.json({ error: 'Informe o valor fechado do negócio' }, { status: 400 })

  const svc = createServiceClient()

  // O imóvel é DESTA empresa? Id vindo do cliente nunca decide sozinho.
  const { data: imovel } = await svc.from('imoveis')
    .select('id, status, finalidade, captado_por, codigo, titulo')
    .eq('id', b.imovel_id).eq('empresa_id', empresaId).maybeSingle()
  if (!imovel) return NextResponse.json({ error: 'Imóvel não encontrado' }, { status: 404 })

  if (!['disponivel', 'reservado'].includes(imovel.status ?? '')) {
    return NextResponse.json({
      error: `Este imóvel está como "${imovel.status}" — não está disponível para fechar negócio.`,
    }, { status: 409 })
  }
  // Imóvel só de venda não fecha locação, e vice-versa. 'ambos' aceita os dois.
  if (imovel.finalidade && imovel.finalidade !== 'ambos' && imovel.finalidade !== tipo) {
    return NextResponse.json({
      error: `Este imóvel está cadastrado para ${imovel.finalidade}, não para ${tipo}.`,
    }, { status: 400 })
  }

  /**
   * A comissão é calculada e CONGELADA agora.
   *
   * As taxas vêm da configuração da loja; o que não estiver configurado usa o padrão
   * de mercado. Congelar no fechamento significa que mudar a taxa em novembro não
   * reescreve o que foi combinado em agosto — mesmo princípio da garantia congelada
   * no contrato.
   */
  const { data: cfgRow } = await svc.from('configuracoes_sistema')
    .select('valor').eq('empresa_id', empresaId).eq('chave', 'comissao_imob').maybeSingle()
  const taxas = mesclarTaxas((cfgRow?.valor ?? null) as Partial<TaxasComissao> | null)
  const cashback = Math.max(0, Number(b.cashback) || 0)
  // Quem de fato assume cada papel — parte de papel vago fica com a casa.
  const corretorId = b.corretor_id ?? userId
  const captadorId = b.captador_id ?? imovel.captado_por ?? null
  const com = calcularComissao(tipo as 'venda' | 'locacao', valor, taxas, cashback, {
    captador: !!captadorId, vendedor: !!corretorId,
  })

  const { data: negocio, error } = await svc.from('negocios_imobiliarios').insert({
    empresa_id: empresaId,
    imovel_id: imovel.id,
    lead_id: b.lead_id ?? null,
    cliente_id: b.cliente_id ?? null,
    tipo,
    valor,
    // Quem vendeu é quem está fechando, salvo indicação contrária.
    corretor_id: corretorId,
    // Captador vem do imóvel; o formulário pode corrigir.
    captador_id: captadorId,
    status: 'contrato',
    assinado_em: b.assinado_em ?? null,
    locacao_inicio: tipo === 'locacao' ? (b.locacao_inicio ?? null) : null,
    locacao_fim: tipo === 'locacao' ? (b.locacao_fim ?? null) : null,
    observacoes: b.observacoes?.trim() || null,
    criado_por: userId,
    percentual: com.percentual,
    comissao_total: com.total,
    comissao_captador: com.captador,
    comissao_vendedor: com.vendedor,
    cashback,
    comissao_status: 'pendente',
    origem: 'funil',
  } as never).select('id').single<{ id: number }>()

  if (error) {
    // 23505 = o índice `negocios_imob_um_ativo_por_imovel`. Traduz para gente.
    const jaTem = error.code === '23505'
    return NextResponse.json({
      error: jaTem
        ? 'Este imóvel já tem um negócio em andamento. Cancele ou finalize o outro antes.'
        : error.message,
    }, { status: jaTem ? 409 : 500 })
  }

  /**
   * O imóvel sai de circulação — com claim, e SEM derrubar o negócio se falhar.
   *
   * A ordem importa: o negócio já está gravado. Se a baixa falhar, devolvemos o
   * negócio criado com um aviso, porque perder o registro do que foi combinado é
   * pior que um status de imóvel desatualizado — e o aviso diz o que conferir.
   */
  const { data: baixado } = await svc.from('imoveis')
    .update({ status: STATUS_IMOVEL_POR_TIPO[tipo] } as never)
    .eq('id', imovel.id).eq('empresa_id', empresaId)
    .in('status', ['disponivel', 'reservado'])
    .select('id').maybeSingle()

  return NextResponse.json({
    ok: true,
    id: negocio.id,
    comissao: com,
    imovelBaixado: !!baixado,
    aviso: baixado ? null : 'O negócio foi registrado, mas o imóvel não saiu de disponível — confira a ficha dele.',
  })
}

/**
 * Comissão lançada à mão — sem imóvel, sem lead, sem baixar estoque.
 *
 * SÓ DONO E ADMIN. Registrar comissão à mão é dizer que a casa deve dinheiro a
 * alguém, sem nenhum negócio no funil para conferir; deixar isso na mão de quem
 * recebe seria assinar o próprio recibo. Fechar negócio de verdade continua sendo
 * trabalho do corretor (o POST normal aceita 'vendedor').
 *
 * O percentual vem DIGITADO: é o que foi combinado naquele acerto. O rateio entre
 * captador, vendedor e casa segue a regra da loja — e sem captador informado, a
 * parte dele fica com a casa, e não reservada para ninguém.
 */
async function lancarComissaoManual(
  b: CorpoNovo, tipo: string, valor: number, empresaId: number, userId: string, role: string,
) {
  if (!['owner', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Só o dono ou um admin pode lançar comissão à mão.' }, { status: 403 })
  }
  const cliente = (b.cliente_nome ?? '').trim()
  if (!cliente) return NextResponse.json({ error: 'Informe o nome do cliente' }, { status: 400 })
  if (!b.corretor_id) return NextResponse.json({ error: 'Escolha o corretor da comissão' }, { status: 400 })
  const pct = Number(b.percentual)
  /**
   * Percentual obrigatório e maior que zero: comissão de 0% é registro que não
   * paga ninguém — o mesmo furo do negócio de R$ 0,00, só mais difícil de ver
   * porque o valor do negócio aparece cheio na tabela.
   */
  if (!(pct > 0)) return NextResponse.json({ error: 'Informe o % de comissão combinado' }, { status: 400 })
  if (pct > 100) return NextResponse.json({ error: 'O % de comissão não pode passar de 100' }, { status: 400 })

  const svc = createServiceClient()

  // O corretor é DESTA empresa? Id vindo do navegador nunca decide sozinho.
  const { data: vinculo } = await svc.from('empresa_usuarios')
    .select('usuario_id').eq('empresa_id', empresaId).eq('usuario_id', b.corretor_id).eq('ativo', true).maybeSingle()
  if (!vinculo) return NextResponse.json({ error: 'Corretor não encontrado nesta empresa' }, { status: 404 })

  const { data: cfgRow } = await svc.from('configuracoes_sistema')
    .select('valor').eq('empresa_id', empresaId).eq('chave', 'comissao_imob').maybeSingle()
  const taxas = mesclarTaxas((cfgRow?.valor ?? null) as Partial<TaxasComissao> | null)

  const pctCashback = Math.min(100, Math.max(0, Number(b.cashback_percentual) || 0))
  const cashback = Math.round(valor * (pctCashback / 100) * 100) / 100
  const captadorId = b.captador_id ?? null
  const com = calcularComissaoPorPercentual(pct, valor, taxas, cashback, {
    captador: !!captadorId, vendedor: true,
  })

  const { data: negocio, error } = await svc.from('negocios_imobiliarios').insert({
    empresa_id: empresaId,
    origem: 'manual',
    imovel_id: null,
    imovel_codigo: (b.imovel_codigo ?? '').trim() || null,
    cliente_nome: cliente,
    lead_id: null,
    cliente_id: null,
    tipo,
    valor,
    corretor_id: b.corretor_id,
    captador_id: captadorId,
    // Comissão à mão não move funil de negócio: nasce e morre no financeiro.
    status: 'finalizado',
    assinado_em: b.assinado_em ?? null,
    observacoes: b.observacoes?.trim() || null,
    criado_por: userId,
    percentual: com.percentual,
    comissao_total: com.total,
    comissao_captador: com.captador,
    comissao_vendedor: com.vendedor,
    cashback,
    cashback_percentual: pctCashback || null,
    comissao_status: 'pendente',
  } as never).select('id').single<{ id: number }>()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    id: negocio.id,
    comissao: com,
    /**
     * Cashback maior que a parte da casa não é bloqueado — pode ter sido o
     * combinado —, mas é DITO. Silenciar isso deixaria a casa em zero e o dono
     * procurando o dinheiro que faltou.
     */
    aviso: cashbackCabe(com, cashback)
      ? null
      : 'O cashback informado é maior que a parte da casa neste negócio — a casa fica em zero.',
  })
}

interface CorpoPatch {
  id?: number
  status?: string
  comissao_status?: string
  vistoria_em?: string | null
  chaves_entregues_em?: string | null
  assinado_em?: string | null
  observacoes?: string | null
}

/** Avança o negócio: marca vistoria, entrega de chaves, finaliza ou cancela. */
export async function PATCH(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor'])
  if (auth.error) return auth.error
  const { empresaId, role } = auth

  const b = (await req.json().catch(() => ({}))) as CorpoPatch
  if (!b.id) return NextResponse.json({ error: 'Negócio não informado' }, { status: 400 })

  const svc = createServiceClient()
  const { data: atual } = await svc.from('negocios_imobiliarios')
    .select('id, status, tipo, imovel_id').eq('id', b.id).eq('empresa_id', empresaId).maybeSingle()
  if (!atual) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  const patch: Record<string, string | null> = {}
  if (b.status && STATUS.includes(b.status as never)) patch.status = b.status
  /**
   * Quitar a comissão estampa a data por conta do servidor.
   *
   * Data de pagamento vinda do navegador é data que o relógio de quem clicou
   * decide — e comissão paga é dinheiro que saiu, não palpite de fuso.
   */
  /**
   * QUITAR COMISSÃO É ATO DE CAIXA — só dono e admin.
   *
   * Avançar vistoria e entrega de chaves é trabalho do corretor, e ele faz. Dizer
   * que o próprio dinheiro já foi pago, não: seria o vendedor assinando o próprio
   * recibo. A tela do corretor não mostra o botão, mas a tela nunca é a tranca.
   */
  if (b.comissao_status && !['owner', 'admin'].includes(role)) {
    return NextResponse.json({
      error: 'Só o dono ou um admin pode marcar comissão como paga.',
    }, { status: 403 })
  }
  /**
   * O ciclo da comissão: pendente → aprovada → paga, e cancelada a qualquer momento.
   *
   * "Aprovada" existe para separar duas decisões que o dono toma em dias
   * diferentes: reconhecer que a comissão é devida, e pagá-la. Sem esse meio, o
   * único jeito de dizer "conferi, está certo" era marcar como paga — e aí a
   * tabela dizia que o dinheiro saiu quando ele não saiu.
   *
   * As datas são do SERVIDOR: data de pagamento vinda do navegador é o relógio de
   * quem clicou, e comissão paga é dinheiro que saiu, não palpite de fuso.
   */
  const hojeIso = () => {
    const h = new Date()
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
  }
  if (b.comissao_status === 'paga') {
    patch.comissao_status = 'paga'
    patch.comissao_paga_em = hojeIso()
  } else if (b.comissao_status === 'aprovada') {
    patch.comissao_status = 'aprovada'
    patch.comissao_aprovada_em = hojeIso()
    // Voltar de paga para aprovada apaga a data de pagamento: o dinheiro não saiu.
    patch.comissao_paga_em = null
  } else if (b.comissao_status === 'cancelada') {
    patch.comissao_status = 'cancelada'
    patch.comissao_paga_em = null
  } else if (b.comissao_status === 'pendente') {
    patch.comissao_status = 'pendente'
    patch.comissao_paga_em = null
    patch.comissao_aprovada_em = null
  }
  for (const campo of ['vistoria_em', 'chaves_entregues_em', 'assinado_em', 'observacoes'] as const) {
    if (campo in b) patch[campo] = (b[campo] || null) as string | null
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada a salvar' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const { error } = await svc.from('negocios_imobiliarios')
    .update(patch as never).eq('id', atual.id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /**
   * Negócio cancelado devolve o imóvel para o mercado.
   *
   * Sem isto, cancelar deixaria o imóvel preso em 'vendido' para sempre — e o
   * índice único liberaria um negócio novo num imóvel que a tela mostra como
   * indisponível. Duas verdades sobre o mesmo imóvel.
   */
  /**
   * `atual.imovel_id` pode ser nulo desde a comissão lançada à mão (20/08/2026):
   * sem esta guarda, cancelar uma comissão avulsa mandaria um update com
   * `id = null` — que não acha nada, mas é consulta escrita por engano.
   */
  if (patch.status === 'cancelado' && atual.imovel_id) {
    await svc.from('imoveis')
      .update({ status: 'disponivel' } as never)
      .eq('id', atual.imovel_id).eq('empresa_id', empresaId)
      .in('status', ['vendido', 'alugado'])
  }

  return NextResponse.json({ ok: true })
}
