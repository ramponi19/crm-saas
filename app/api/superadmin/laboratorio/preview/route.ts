import { NextResponse } from 'next/server'
import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'

const IMPERSONATE_COOKIE = 'impersonating_empresa_id'
const TTL_SECONDS = 60 * 60 * 4
const PREVIEW_SLUG = '__preview__'

/**
 * Entra na empresa de LABORATÓRIO para construir tela nova.
 *
 * Reusa a mesma empresa de preview do /superadmin/segmentos (slug fixo, demo,
 * fora das métricas) em vez de criar outra: duas empresas de teste viram duas
 * bases de sujeira, e ninguém lembra qual é qual.
 *
 * Diferente do preview de segmento, aqui NÃO se troca o segmento dela — quem
 * está construindo quer o segmento como está, não um específico.
 */
export async function POST() {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const { userId, supabase } = ctx

  const svc = createServiceClient()
  let { data: empresa } = await svc.from('empresas').select('id').eq('slug', PREVIEW_SLUG).maybeSingle()

  if (!empresa) {
    const { data: nova, error } = await svc.from('empresas').insert({
      nome: 'Laboratório', slug: PREVIEW_SLUG, segmento: 'varejo', status: 'ativo', demo: true,
    } as never).select('id').single()
    if (error || !nova) {
      return NextResponse.json({ error: `Falha ao preparar o laboratório: ${error?.message ?? '—'}` }, { status: 500 })
    }
    empresa = nova
  }

  const { error: impErr } = await supabase.rpc('set_impersonation', {
    p_empresa_id: empresa.id, p_ttl_seconds: TTL_SECONDS,
  })
  if (impErr) return NextResponse.json({ error: `Falha ao entrar: ${impErr.message}` }, { status: 500 })

  await logSuperAdminAction({ adminUserId: userId, empresaId: empresa.id, acao: 'laboratorio', detalhes: {} })

  const res = NextResponse.json({ ok: true, empresaId: empresa.id })
  res.cookies.set(IMPERSONATE_COOKIE, String(empresa.id), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TTL_SECONDS,
  })
  return res
}
