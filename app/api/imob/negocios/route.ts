import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { calcularComissao, mesclarTaxas, type TaxasComissao } from '@/lib/comissao-imob'

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

  if (!b.imovel_id) return NextResponse.json({ error: 'Escolha o imóvel do negócio' }, { status: 400 })
  if (!tipo) return NextResponse.json({ error: 'Diga se é venda ou locação' }, { status: 400 })
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
  const com = calcularComissao(tipo as 'venda' | 'locacao', valor, taxas, cashback)

  const { data: negocio, error } = await svc.from('negocios_imobiliarios').insert({
    empresa_id: empresaId,
    imovel_id: imovel.id,
    lead_id: b.lead_id ?? null,
    cliente_id: b.cliente_id ?? null,
    tipo,
    valor,
    // Quem vendeu é quem está fechando, salvo indicação contrária.
    corretor_id: b.corretor_id ?? userId,
    // Captador vem do imóvel; o formulário pode corrigir.
    captador_id: b.captador_id ?? imovel.captado_por ?? null,
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
    comissao_status: 'prevista',
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
  if (b.comissao_status === 'paga') {
    patch.comissao_status = 'paga'
    const hoje = new Date()
    patch.comissao_paga_em = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
  } else if (b.comissao_status === 'prevista') {
    patch.comissao_status = 'prevista'
    patch.comissao_paga_em = null
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
  if (patch.status === 'cancelado') {
    await svc.from('imoveis')
      .update({ status: 'disponivel' } as never)
      .eq('id', atual.imovel_id).eq('empresa_id', empresaId)
      .in('status', ['vendido', 'alugado'])
  }

  return NextResponse.json({ ok: true })
}
