import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'

// Reserva de unidade do estoque para um lead (48h). Feita no modal do lead;
// a venda é finalizada no PDV (aba Reservas). Cancelamento: só quem reservou
// ou owner/admin. Expiração é aplicada aqui, de forma preguiçosa.
const RESERVA_HORAS = 48

async function expirarReservas(svc: ReturnType<typeof createServiceClient>, empresaId: number) {
  await svc
    .from('inventario_unidades')
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
  const { data: lead } = await svc.from('leads').select('id').eq('id', body.leadId).eq('empresa_id', auth.empresaId).eq('ativo', true).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const agora = new Date()
  const expira = new Date(agora.getTime() + RESERVA_HORAS * 3600_000)

  // Claim atômico: só reserva se ainda estiver disponível.
  const { data: unidade } = await svc
    .from('inventario_unidades')
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
    .select('id, cor, armazenamento, condicao, preco_venda, produtos!produto_id(nome)')
    .maybeSingle()

  if (!unidade) return NextResponse.json({ error: 'Esta unidade não está mais disponível.' }, { status: 409 })

  // Preenche o interesse do lead com o produto real reservado.
  const prod = Array.isArray(unidade.produtos) ? unidade.produtos[0] : unidade.produtos
  const descricao = [prod?.nome, unidade.armazenamento, unidade.cor, unidade.condicao ? `(${unidade.condicao})` : null].filter(Boolean).join(' ')
  await svc.from('leads').update({
    produto_interessado: descricao || null,
    valor_estimado: unidade.preco_venda ?? null,
  }).eq('id', body.leadId)

  return NextResponse.json({ ok: true, descricao, expiraEm: expira.toISOString() })
}

export async function DELETE(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null) as { unidadeId?: number } | null
  if (!body?.unidadeId) return NextResponse.json({ error: 'unidadeId é obrigatório' }, { status: 400 })

  const svc = createServiceClient()
  const { data: unidade } = await svc
    .from('inventario_unidades')
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
    .from('inventario_unidades')
    .update({ status: 'disponivel', reservado_lead_id: null, reservado_por: null, reservado_em: null, reserva_expira_em: null })
    .eq('id', body.unidadeId)

  return NextResponse.json({ ok: true })
}
