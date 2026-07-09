import { NextResponse } from 'next/server'
import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'

const IMPERSONATE_COOKIE = 'impersonating_empresa_id'
const TTL_SECONDS = 60 * 60 * 4 // 4h — coincide com o maxAge do cookie

/**
 * Preview de um segmento: usa UMA ÚNICA empresa de DEMONSTRAÇÃO reutilizada por
 * todos os segmentos (1 linha no banco, slug fixo, demo=true, fora das métricas).
 * Ao clicar, troca o segmento dessa empresa e inicia a impersonação — assim o
 * superadmin navega o CRM do segmento sem poluir o banco nem precisar de conta real.
 */
const PREVIEW_SLUG = '__preview__'

export async function POST(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const { userId, supabase } = ctx

  const svc = createServiceClient()

  // Segmento precisa existir na config
  const { data: seg } = await svc.from('segmentos_config').select('chave, label').eq('chave', chave).maybeSingle()
  if (!seg) return NextResponse.json({ error: 'Segmento não encontrado' }, { status: 404 })

  // Uma única empresa de preview (reutilizada); troca o segmento dela p/ o escolhido.
  let { data: empresa } = await svc.from('empresas').select('id').eq('slug', PREVIEW_SLUG).maybeSingle()
  if (!empresa) {
    const { data: nova, error } = await svc.from('empresas').insert({
      nome: `Preview · ${seg.label}`, slug: PREVIEW_SLUG, segmento: chave, status: 'ativo', demo: true,
    } as never).select('id').single()
    if (error || !nova) return NextResponse.json({ error: `Falha ao preparar preview: ${error?.message ?? '—'}` }, { status: 500 })
    empresa = nova
  } else {
    await svc.from('empresas').update({ segmento: chave, nome: `Preview · ${seg.label}` } as never).eq('id', empresa.id)
  }

  // Inicia a impersonação (mesma RPC do fluxo de impersonar empresa)
  const { error: impErr } = await supabase.rpc('set_impersonation', { p_empresa_id: empresa.id, p_ttl_seconds: TTL_SECONDS })
  if (impErr) return NextResponse.json({ error: `Falha ao iniciar preview: ${impErr.message}` }, { status: 500 })

  await logSuperAdminAction({ adminUserId: userId, empresaId: empresa.id, acao: 'preview_segmento', detalhes: { chave } })

  const res = NextResponse.json({ ok: true, empresaId: empresa.id })
  res.cookies.set(IMPERSONATE_COOKIE, String(empresa.id), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TTL_SECONDS })
  return res
}
