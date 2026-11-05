import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { nadaGravado } from '@/lib/linhas-afetadas'

// Reserva de unidade do estoque para um lead (48h). Feita no modal do lead;
// a venda é finalizada no PDV (aba Reservas). Cancelamento: só quem reservou
// ou owner/admin. Expiração é aplicada aqui, de forma preguiçosa.
const RESERVA_HORAS = 48

async function expirarReservas(svc: ReturnType<typeof createServiceClient>, empresaId: number) {
  await svc
    .from('estoque_unidades')
    .update({ status: 'disponivel', reservado_lead_id: null, reservado_por: null, reservado_em: null, reserva_expira_em: null })
    .eq('empresa_id', empresaId)
    .eq('status', 'reservado')
    .not('reservado_lead_id', 'is', null)
    .lt('reserva_expira_em', new Date().toISOString())
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null) as { unidadeId?: number; leadId?: number } | null
  if (!body?.unidadeId || !body?.leadId) {
    return NextResponse.json({ error: 'unidadeId e leadId são obrigatórios' }, { status: 400 })
  }

  const svc = createServiceClient()
  await expirarReservas(svc, auth.empresaId)

  // Lead precisa ser da mesma empresa (evita reservar estoque para lead alheio).
  // O lead é o negócio (a view `leads` caiu); `dados` para gravar o interesse abaixo.
  const { data: lead } = await svc.from('negocios').select('id, dados').eq('id', body.leadId).eq('empresa_id', auth.empresaId).eq('ativo', true).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const agora = new Date()
  const expira = new Date(agora.getTime() + RESERVA_HORAS * 3600_000)

  // Claim atômico: só reserva se ainda estiver disponível.
  const { data: unidade } = await svc
    .from('estoque_unidades')
    .update({
      status: 'reservado',
      reservado_lead_id: body.leadId,
      reservado_por: auth.userId,
      reservado_em: agora.toISOString(),
      reserva_expira_em: expira.toISOString(),
    })
    .eq('id', body.unidadeId)
    .eq('empresa_id', auth.empresaId)
    .eq('status', 'disponivel')
    .eq('ativo', true)
    .select('id, cor, armazenamento, condicao, preco_venda, produtos:estoque_produtos!produto_id(nome)')
    .maybeSingle()

  if (!unidade) return NextResponse.json({ error: 'Esta unidade não está mais disponível.' }, { status: 409 })

  // Preenche o interesse do lead com o produto real reservado.
  const prod = Array.isArray(unidade.produtos) ? unidade.produtos[0] : unidade.produtos
  const descricao = [prod?.nome, unidade.armazenamento, unidade.cor, unidade.condicao ? `(${unidade.condicao})` : null].filter(Boolean).join(' ')
  // `produto_interessado` mora em negocios.dados; vazio tira a chave, como a view fazia.
  const dados = { ...((lead.dados ?? {}) as Record<string, unknown>) }
  if (descricao) dados.produto_interessado = descricao
  else delete dados.produto_interessado
  const { data: gravado, error: erroLead } = await svc.from('negocios').update({
    dados,
    valor_estimado: unidade.preco_venda ?? null,
  } as never).eq('id', body.leadId).select('id')
  // A reserva já valeu; o interesse no lead é complemento — registra e segue.
  if (erroLead || nadaGravado(gravado)) console.error('[reservas] interesse do lead não gravado:', body.leadId, erroLead?.message)

  return NextResponse.json({ ok: true, descricao, expiraEm: expira.toISOString() })
}

export async function DELETE(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null) as { unidadeId?: number } | null
  if (!body?.unidadeId) return NextResponse.json({ error: 'unidadeId é obrigatório' }, { status: 400 })

  const svc = createServiceClient()
  const { data: unidade } = await svc
    .from('estoque_unidades')
    .select('id, status, reservado_por, reservado_lead_id')
    .eq('id', body.unidadeId)
    .eq('empresa_id', auth.empresaId)
    .maybeSingle()

  if (!unidade || unidade.status !== 'reservado' || !unidade.reservado_lead_id) {
    return NextResponse.json({ error: 'Reserva não encontrada' }, { status: 404 })
  }
  const isAdmin = auth.role === 'owner' || auth.role === 'admin'
  if (!isAdmin && unidade.reservado_por !== auth.userId) {
    return NextResponse.json({ error: 'Só quem reservou (ou um admin) pode cancelar esta reserva.' }, { status: 403 })
  }

  await svc
    .from('estoque_unidades')
    .update({ status: 'disponivel', reservado_lead_id: null, reservado_por: null, reservado_em: null, reserva_expira_em: null })
    .eq('id', body.unidadeId)

  return NextResponse.json({ ok: true })
}
