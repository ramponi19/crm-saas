import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { confirmacao?: string }
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('nome, slug').eq('id', empresaId).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

  // 1) Confirmação: precisa digitar o nome exato.
  if ((body.confirmacao ?? '').trim() !== empresa.nome) {
    return NextResponse.json({ error: 'O nome digitado não confere com o da empresa.' }, { status: 400 })
  }

  // 2) Trava anti-Meta: recusa se houver canal Meta/WhatsApp ativo (protege o
  // recebimento de mensagens). A fonte é canais_conectados — configuracoes_sistema
  // não guarda mais canal nem token.
  const { count: canaisAtivos } = await svc
    .from('canais_conectados')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('status', 'ativo')
  if ((canaisAtivos ?? 0) > 0) {
    return NextResponse.json({
      error: 'Esta empresa tem integração Meta/WhatsApp ativa. Desative as integrações antes de excluir (proteção do teste da Meta).',
    }, { status: 409 })
  }

  // 3) Loga ANTES de apagar (o log sobrevive: hard_delete nulifica empresa_id).
  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'excluir_empresa_lgpd',
    detalhes: { nome: empresa.nome, slug: empresa.slug },
  })

  // 4) Exclusão via RPC (SECURITY DEFINER), com o client AUTENTICADO do super
  // admin — a função valida auth.uid() = super admin e roda transacional.
  const { error } = await auth.supabase.rpc('hard_delete_empresa', { p_empresa_id: empresaId })
  if (error) {
    return NextResponse.json({ error: `Falha ao excluir: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
