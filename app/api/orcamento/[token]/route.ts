import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

// Aprovação/recusa do orçamento pelo cliente (público, via token).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = createServiceClient()

  const { data: orc } = await svc.from('orcamentos')
    .select('id, empresa_id, lead_id, tipo, status, aprovado_em, recusado_em, aparelho, imei, defeito, itens, total, valor_devolver, acerto, os_id, cliente_nome, cliente_id, usuario_id, observacoes, aparelho_novo, valor_novo, aparelho_usado, valor_entrada, unidade_id')
    .eq('token', token).maybeSingle()
  if (!orc) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404, headers: CORS })

  const b = (await req.json().catch(() => ({}))) as { acao?: string }
  const nowIso = new Date().toISOString()

  if (b.acao === 'recusar') {
    // Idempotente: só recusa se ainda não foi aprovado nem recusado.
    const { data: claimed } = await svc.from('orcamentos')
      .update({ status: 'recusado', recusado_em: nowIso } as never)
      .eq('id', orc.id).is('aprovado_em', null).is('recusado_em', null)
      .select('id').maybeSingle()
    if (!claimed) return NextResponse.json({ ok: true, status: orc.aprovado_em ? 'aprovado' : 'recusado' }, { headers: CORS })
    return NextResponse.json({ ok: true, status: 'recusado' }, { headers: CORS })
  }

  if (b.acao === 'aprovar') {
    // Claim atômico: marca aprovado ANTES das automações. Só um request concorrente
    // vence (aprovado_em IS NULL) — evita venda/estoque duplicados por replay/corrida.
    const { data: claimed } = await svc.from('orcamentos')
      .update({ status: 'aprovado', aprovado_em: nowIso } as never)
      .eq('id', orc.id).is('aprovado_em', null).is('recusado_em', null)
      .select('id').maybeSingle()
    if (!claimed) return NextResponse.json({ ok: true, status: orc.recusado_em ? 'recusado' : 'aprovado' }, { headers: CORS })

    // Assistência/melhoria aprovada → abre uma OS (reusa garantias_assistencias).
    let osId = orc.os_id
    if (!osId && (orc.tipo === 'assistencia' || orc.tipo === 'melhoria')) {
      const { data: os } = await svc.from('garantias_assistencias').insert({
        empresa_id: orc.empresa_id,
        tipo: 'assistencia',
        cliente_id: orc.cliente_id ?? null,
        defeito_relatado: orc.defeito ?? (orc.tipo === 'melhoria' ? 'Upgrade/melhoria do aparelho' : null),
        orcamento_valor: orc.total,
        imei_serial: orc.imei,
        status: 'aprovado',
        aprovado_em: nowIso,
        data_entrada: nowIso,
        observacoes: `Aberta a partir do orçamento aprovado — ${orc.cliente_nome}`,
      }).select('id').single()
      osId = os?.id ?? null
    }

    // Downgrade aprovado → dá entrada do usado no estoque + registra a venda.
    if (orc.tipo === 'downgrade') {
      /**
       * Quem leva a venda: o responsável pelo lead e, na falta dele, QUEM FEZ O
       * ORÇAMENTO.
       *
       * Antes só o lead contava. Orçamento criado pela tela de Orçamentos não tem
       * lead — e o teste mostrou o resultado: venda concluída de R$ 1.500 sem
       * vendedor nenhum. Isso não é detalhe de cadastro: ranking e comissão saem de
       * `vendedor_id`, então a venda simplesmente não era de ninguém.
       */
      let vendedorId: string | null = null
      if (orc.lead_id) {
        const { data: lead } = await svc.from('leads').select('responsavel_id').eq('id', orc.lead_id).maybeSingle()
        vendedorId = lead?.responsavel_id ?? null
      }
      vendedorId = vendedorId ?? orc.usuario_id ?? null

      // Amarra a unidade recebida à venda gerada aqui — mesmo mecanismo do PDV,
      // que é o que segura a comissão até a chegada ser confirmada.
      const grupoPdv = crypto.randomUUID()

      // PENDENTE, não disponível: o cliente aprovou por link, o aparelho dele
      // ainda não passou pelo balcão. Fica no nome do responsável pelo lead.
      await svc.from('inventario_unidades').insert({
        empresa_id: orc.empresa_id,
        produto_id: null,
        condicao: 'usado',
        estado: 'bom',
        // `tipo` da UNIDADE segue 'troca': é o tipo de entrada da peça no estoque,
        // o mesmo que o PDV usa. Não acompanha o nome do tipo de orçamento.
        tipo: 'troca',
        status: 'pendente',
        grupo_pdv: grupoPdv,
        usuario_id: vendedorId,
        preco_custo: orc.valor_entrada ?? null,
        observacoes: `Entrada por downgrade — orçamento #${orc.id}${orc.aparelho_usado ? ` (${orc.aparelho_usado})` : ''}, cliente ${orc.cliente_nome}.`,
        ativo: true,
      } as never)
      // A venda vale o aparelho que sai MAIS os itens da negociação. O aparelho
      // recebido não abate daqui: ele é pagamento em espécie, igual ao PDV. Abater
      // registraria prejuízo numa venda lucrativa.
      const itensOrc = Array.isArray(orc.itens) ? (orc.itens as unknown as { qtd?: number; valor?: number }[]) : []
      const itensTotal = itensOrc.reduce((s, i) => s + Math.max(1, Number(i.qtd) || 1) * (Number(i.valor) || 0), 0)
      const valorVenda = (Number(orc.valor_novo) || 0) + itensTotal
      const vale = Number(orc.valor_entrada) || 0
      // O aparelho paga até o valor da venda; o que passar disso é o saldo do
      // cliente, acertado por fora (dinheiro/crédito/produto), não pagamento.
      const trocaPaga = Math.min(vale, valorVenda)

      const { data: venda } = await svc.from('vendas').insert({
        empresa_id: orc.empresa_id,
        grupo_pdv: grupoPdv,
        valor_venda: valorVenda,
        data_venda: nowIso,
        vendedor_id: vendedorId,
        usuario_id: vendedorId,
        cliente_id: orc.cliente_id ?? null,
        canal_venda: 'downgrade',
        observacoes: `Downgrade — orçamento #${orc.id}. Novo: ${orc.aparelho_novo ?? ''}. Entrada: ${orc.aparelho_usado ?? ''} (R$ ${vale}). Cliente pagou: R$ ${orc.total}.${Number(orc.valor_devolver) > 0 ? ` Saldo a favor do cliente: R$ ${orc.valor_devolver} (${orc.acerto}).` : ''}`,
      } as never).select('id').single<{ id: number }>()

      // Registra SÓ o pagamento em aparelho, mesma convenção do PDV (`troca`
      // como forma de pagamento). A parte em dinheiro fica de fora de propósito:
      // aprovar o link não diz COMO o cliente vai pagar, e `forma_pagamento` é
      // NOT NULL — inventar um método afirmaria que o dinheiro entrou. Aqui só
      // entra o que de fato aconteceu: o aparelho trocou de mãos.
      if (venda?.id && trocaPaga > 0.005) {
        await svc.from('vendas_pagamentos').insert({
          empresa_id: orc.empresa_id, venda_id: venda.id,
          forma_pagamento: 'troca', valor_pago: trocaPaga,
        } as never)
      }

      // Saldo a favor do cliente: dinheiro e crédito são OBRIGAÇÃO da loja, então
      // viram conta a pagar no Financeiro — senão o combinado na negociação
      // dependeria da memória de quem atendeu. 'produto' já foi abatido nos itens
      // e 'nenhum' foi negociado a zero: nada a lançar.
      const devolver = Number(orc.valor_devolver) || 0
      if (devolver > 0 && (orc.acerto === 'dinheiro' || orc.acerto === 'credito')) {
        const ehCredito = orc.acerto === 'credito'
        await svc.from('lancamentos_financeiros').insert({
          empresa_id: orc.empresa_id,
          tipo: 'despesa',
          descricao: `${ehCredito ? 'Crédito' : 'Devolução'} — downgrade de ${orc.cliente_nome}`,
          valor: devolver,
          data_venc: nowIso.slice(0, 10),
          status: 'pendente',
          categoria: ehCredito ? 'Crédito de cliente' : 'Devolução de troca',
          referencia_id: orc.id,
          referencia_tp: 'orcamento',
          observacoes: `Orçamento #${orc.id}. Entrada: ${orc.aparelho_usado ?? ''} (R$ ${vale}) por ${orc.aparelho_novo ?? ''} (R$ ${orc.valor_novo ?? 0}).${ehCredito ? ' Crédito para usar em compra futura — o PDV não abate automaticamente.' : ''}`,
        } as never)
      }
    }

    // Venda/semi-novo com unidade do estoque → baixa a unidade + registra a venda.
    if (orc.tipo === 'venda' && orc.unidade_id) {
      // O CUSTO vem da unidade. Sem ele a venda entra com valor_custo no default 0
      // e `lucro` (coluna gerada) devolve o preço inteiro como margem — 100% de
      // lucro num aparelho comprado por dinheiro. O relatório mostrava isso como
      // se fosse conta fechada.
      const { data: uni } = await svc.from('inventario_unidades')
        .select('id, status, preco_custo, produto_id, imei, numero_serie')
        .eq('id', orc.unidade_id).eq('empresa_id', orc.empresa_id).maybeSingle()

      // Claim atômico: só sai do estoque o que ainda ESTÁ no estoque. Se o balcão
      // vendeu a mesma peça antes do cliente clicar no link, a segunda venda não
      // pode ser registrada — seriam dois faturamentos para um aparelho só.
      const { data: baixada } = await svc.from('inventario_unidades')
        .update({ status: 'vendido' } as never)
        .eq('id', orc.unidade_id).eq('empresa_id', orc.empresa_id)
        .in('status', ['disponivel', 'reservado'])
        .select('id').maybeSingle()

      if (!baixada) {
        // O orçamento fica aprovado (o cliente aprovou mesmo), mas a venda NÃO é
        // criada. Registrado por escrito no próprio orçamento, porque quem abrir a
        // tela precisa saber por que não há venda — silêncio aqui viraria "o
        // sistema perdeu minha venda".
        await svc.from('orcamentos').update({
          observacoes: [orc.observacoes, `[${nowIso.slice(0, 10)}] Cliente aprovou pelo link, mas o item já não estava disponível no estoque (status: ${uni?.status ?? 'não encontrado'}). Nenhuma venda foi registrada — confira com o vendedor.`].filter(Boolean).join(' '),
        } as never).eq('id', orc.id)
      } else {
        let vendedorId: string | null = null
        if (orc.lead_id) {
          const { data: lead } = await svc.from('leads').select('responsavel_id').eq('id', orc.lead_id).maybeSingle()
          vendedorId = lead?.responsavel_id ?? null
        }
        // Ver a nota na ramificação do downgrade: sem lead, quem fez o orçamento leva.
        vendedorId = vendedorId ?? orc.usuario_id ?? null
        await svc.from('vendas').insert({
          empresa_id: orc.empresa_id,
          // Amarra a venda à peça que saiu: sem isto o aparelho ficava 'vendido' no
          // estoque sem nada apontando para qual venda o levou.
          unidade_id: orc.unidade_id,
          produto_id: uni?.produto_id ?? null,
          numero_serie: uni?.imei ?? uni?.numero_serie ?? null,
          valor_venda: orc.total ?? 0,
          valor_custo: uni?.preco_custo ?? 0,
          // `lucro` não entra: é coluna gerada (venda − custo). Enviar valor faz o
          // Postgres recusar o INSERT inteiro com 428C9.
          cliente_id: orc.cliente_id ?? null,
          data_venda: nowIso,
          vendedor_id: vendedorId,
          usuario_id: vendedorId,
          canal_venda: 'orcamento',
          observacoes: `Venda por orçamento #${orc.id} — ${orc.cliente_nome}.`,
        } as never)
      }
    }

    if (osId && osId !== orc.os_id) await svc.from('orcamentos').update({ os_id: osId } as never).eq('id', orc.id)
    return NextResponse.json({ ok: true, status: 'aprovado' }, { headers: CORS })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400, headers: CORS })
}
