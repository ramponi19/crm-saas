import { NextResponse } from 'next/server'
import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'

const IMPERSONATE_COOKIE = 'impersonating_empresa_id'
const TTL_SECONDS = 60 * 60 * 4 // 4h — coincide com o maxAge do cookie

/**
 * Preview de um segmento: acha-ou-cria uma empresa de DEMONSTRAÇÃO (demo=true,
 * fora das métricas) daquele segmento e inicia a impersonação nela. Assim o
 * superadmin navega o CRM do segmento sem precisar de uma empresa real.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const { userId, supabase } = ctx

  const svc = createServiceClient()

  // Segmento precisa existir na config
  const { data: seg } = await svc.from('segmentos_config').select('chave, label').eq('chave', chave).maybeSingle()
  if (!seg) return NextResponse.json({ error: 'Segmento não encontrado' }, { status: 404 })

  // Acha-ou-cria a empresa demo do segmento (única por slug)
  const slug = `demo-${chave}`
  let { data: empresa } = await svc.from('empresas').select('id').eq('slug', slug).maybeSingle()
  if (!empresa) {
    const { data: nova, error } = await svc.from('empresas').insert({
      nome: `Demonstração · ${seg.label}`,
      slug,
      segmento: chave,
      status: 'ativo',
      demo: true,
    } as never).select('id').single()
    if (error || !nova) return NextResponse.json({ error: `Falha ao criar demo: ${error?.message ?? '—'}` }, { status: 500 })
    empresa = nova
  }

  // Inicia a impersonação (mesma RPC do fluxo de impersonar empresa)
  const { error: impErr } = await supabase.rpc('set_impersonation', { p_empresa_id: empresa.id, p_ttl_seconds: TTL_SECONDS })
  if (impErr) return NextResponse.json({ error: `Falha ao iniciar preview: ${impErr.message}` }, { status: 500 })

  await logSuperAdminAction({ adminUserId: userId, empresaId: empresa.id, acao: 'preview_segmento', detalhes: { chave } })

  const res = NextResponse.json({ ok: true, empresaId: empresa.id })
  res.cookies.set(IMPERSONATE_COOKIE, String(empresa.id), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TTL_SECONDS })
  return res
}
