import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { confirmacao?: string }
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('nome, slug, stripe_subscription_id').eq('id', empresaId).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

  // 1) Confirmação: precisa digitar o nome exato.
  if ((body.confirmacao ?? '').trim() !== empresa.nome) {
    return NextResponse.json({ error: 'O nome digitado não confere com o da empresa.' }, { status: 400 })
  }

  // 2) Trava anti-Meta: recusa se houver canal Meta/WhatsApp ativo (protege o
  // recebimento de mensagens). A fonte é canais_conectados — configuracoes_sistema
  // não guarda mais canal nem token.
  const { count: canaisAtivos } = await svc
    .from('canais')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('status', 'ativo')
  if ((canaisAtivos ?? 0) > 0) {
    return NextResponse.json({
      error: 'Esta empresa tem integração Meta/WhatsApp ativa. Desative as integrações antes de excluir (proteção do teste da Meta).',
    }, { status: 409 })
  }

  // Quem entra por esta empresa (antes de apagar o vínculo): o login só sai se a pessoa não for de outra.
  const { data: vinculos } = await svc.from('empresa_usuarios').select('usuario_id').eq('empresa_id', empresaId)
  const pessoas = [...new Set(((vinculos ?? []) as { usuario_id: string }[]).map((v) => v.usuario_id))]

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

  // 5) O que fica FORA do banco da empresa (17/11/2026: antes ficava preso). Cada passo é independente:
  //    o que falhar vai para a resposta e para o log, sem desfazer a exclusão.
  const pendencias: string[] = []

  // 5a) Assinatura no Stripe: cancelada na hora (sem cobrança depois de excluir).
  if (empresa.stripe_subscription_id) {
    try { await getStripe().subscriptions.cancel(empresa.stripe_subscription_id) }
    catch (e) { pendencias.push(`assinatura ${empresa.stripe_subscription_id}: ${e instanceof Error ? e.message : String(e)}`) }
  }

  // 5b) Login: quem não é de nenhuma outra empresa (nem superadmin) sai do Auth — o e-mail fica livre
  //     para um cadastro novo (antes: login -> /register -> 409 "já cadastrado").
  for (const uid of pessoas) {
    const [{ count: outras }, { data: perfil }] = await Promise.all([
      svc.from('empresa_usuarios').select('id', { count: 'exact', head: true }).eq('usuario_id', uid),
      svc.from('usuarios').select('is_super_admin').eq('id', uid).maybeSingle(),
    ])
    if ((outras ?? 0) > 0 || (perfil as { is_super_admin?: boolean } | null)?.is_super_admin) continue
    await svc.from('usuarios').delete().eq('id', uid)
    const { error: eAuth } = await svc.auth.admin.deleteUser(uid)
    if (eAuth) pendencias.push(`login ${uid}: ${eAuth.message}`)
  }

  // 5c) Arquivos da empresa nos buckets com pasta por empresa (<empresa_id>/..., com subpastas como
  //     <empresa_id>/avatares/). Lista a árvore e apaga em lotes de 100.
  const arquivosDaPasta = async (bucket: string, pasta: string, fundo = 0): Promise<string[]> => {
    if (fundo > 6) return []
    const out: string[] = []
    for (let pag = 0; pag < 200; pag++) {
      const { data: lista, error: eLista } = await svc.storage.from(bucket).list(pasta, { limit: 1000, offset: pag * 1000 })
      if (eLista) throw eLista
      for (const o of lista ?? []) {
        if (o.id) out.push(`${pasta}/${o.name}`)
        else out.push(...await arquivosDaPasta(bucket, `${pasta}/${o.name}`, fundo + 1))
      }
      if ((lista ?? []).length < 1000) break
    }
    return out
  }
  for (const bucket of ['produtos', 'contratos', 'imoveis', 'documentos', 'chat-midia']) {
    try {
      const nomes = await arquivosDaPasta(bucket, String(empresaId))
      for (let i = 0; i < nomes.length; i += 100) {
        const { error: eDel } = await svc.storage.from(bucket).remove(nomes.slice(i, i + 100))
        if (eDel) { pendencias.push(`storage ${bucket}: ${eDel.message}`); break }
      }
    } catch (e) { pendencias.push(`storage ${bucket}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  if (pendencias.length) console.error('[excluir empresa] pendências', { empresaId, pendencias })

  return NextResponse.json({ ok: true, pendencias })
}
