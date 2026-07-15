import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

// Aprovação/recusa do orçamento pelo cliente (público, via token).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = createServiceClient()

  const { data: orc } = await svc.from('orcamentos')
    .select('id, empresa_id, lead_id, tipo, status, aprovado_em, recusado_em, aparelho, imei, defeito, total, os_id, cliente_nome, aparelho_novo, valor_novo, aparelho_usado, valor_entrada, unidade_id')
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

    // Troca aprovada → dá entrada do usado no estoque + registra a venda.
    if (orc.tipo === 'troca') {
      await svc.from('inventario_unidades').insert({
        empresa_id: orc.empresa_id,
        produto_id: null,
        condicao: 'usado',
        estado: 'bom',
        tipo: 'troca',
        status: 'disponivel',
        preco_custo: orc.valor_entrada ?? null,
        observacoes: `Entrada por troca — orçamento #${orc.id}${orc.aparelho_usado ? ` (${orc.aparelho_usado})` : ''}, cliente ${orc.cliente_nome}.`,
        ativo: true,
      } as never)

      let vendedorId: string | null = null
      if (orc.lead_id) {
        const { data: lead } = await svc.from('leads').select('responsavel_id').eq('id', orc.lead_id).maybeSingle()
        vendedorId = lead?.responsavel_id ?? null
      }
      await svc.from('vendas').insert({
        empresa_id: orc.empresa_id,
        valor_venda: (Number(orc.valor_novo) || orc.total) ?? 0,
        data_venda: nowIso,
        vendedor_id: vendedorId,
        canal_venda: 'troca',
        observacoes: `Troca — orçamento #${orc.id}. Novo: ${orc.aparelho_novo ?? ''}. Entrada: ${orc.aparelho_usado ?? ''} (R$ ${orc.valor_entrada ?? 0}). Diferença paga: R$ ${orc.total}.`,
      } as never)
    }

    // Venda/semi-novo com unidade do estoque → baixa a unidade + registra a venda.
    if (orc.tipo === 'venda' && orc.unidade_id) {
      await svc.from('inventario_unidades').update({ status: 'vendido' } as never).eq('id', orc.unidade_id).eq('empresa_id', orc.empresa_id)
      let vendedorId: string | null = null
      if (orc.lead_id) {
        const { data: lead } = await svc.from('leads').select('responsavel_id').eq('id', orc.lead_id).maybeSingle()
        vendedorId = lead?.responsavel_id ?? null
      }
      await svc.from('vendas').insert({
        empresa_id: orc.empresa_id,
        valor_venda: orc.total ?? 0,
        data_venda: nowIso,
        vendedor_id: vendedorId,
        canal_venda: 'orcamento',
        observacoes: `Venda por orçamento #${orc.id} — ${orc.cliente_nome}.`,
      } as never)
    }

    if (osId && osId !== orc.os_id) await svc.from('orcamentos').update({ os_id: osId } as never).eq('id', orc.id)
    return NextResponse.json({ ok: true, status: 'aprovado' }, { headers: CORS })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400, headers: CORS })
}
