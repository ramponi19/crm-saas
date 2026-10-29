import { NextResponse } from 'next/server'
import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { aplicarPreset, lerPreset, type PresetCompleto } from '@/lib/presets'

const IMPERSONATE_COOKIE = 'impersonating_empresa_id'
const TTL_SECONDS = 60 * 60 * 4 // 4h — coincide com o maxAge do cookie
const PREVIEW_SLUG = '__preview__'

/**
 * Entra na empresa de DEMONSTRAÇÃO do superadmin (slug fixo, demo=true, fora das
 * métricas) e inicia a impersonação.
 *
 * Duas portas usam: o preview de preset (/superadmin/presets, aplica o preset
 * escolhido na empresa) e o laboratório (/superadmin/laboratorio, entra com a
 * empresa como está). Eram duas rotas com o mesmo corpo copiado (etapa 0,
 * 21/10/2026); a diferença ficou só no `preset`.
 *
 * Desde 29/10/2026 trocar `preset_onboarding` não muda tela nenhuma: o preview
 * APLICA o preset (lib/presets.ts → aplicarPreset, substituindo o anterior), como
 * o cadastro faria com uma empresa nova.
 *
 * Uma empresa só, de propósito: duas empresas de teste viram duas bases de
 * sujeira, e ninguém lembra qual é qual.
 */
export async function entrarNaEmpresaDePreview(
  preset: PresetCompleto | null,
): Promise<NextResponse> {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const { userId, supabase } = ctx

  const svc = createServiceClient()
  const nome = preset ? `Preview · ${preset.nome}` : 'Laboratório'
  let { data: empresa } = await svc.from('empresas').select('id').eq('slug', PREVIEW_SLUG).maybeSingle()
  if (!empresa) {
    const { data: nova, error } = await svc.from('empresas').insert({
      nome, slug: PREVIEW_SLUG, preset_onboarding: preset?.chave ?? 'varejo', status: 'ativo', demo: true,
    } as never).select('id').single()
    if (error || !nova) return NextResponse.json({ error: `Falha ao preparar a empresa de preview: ${error?.message ?? '—'}` }, { status: 500 })
    empresa = nova
    // Empresa de demonstração recém-criada: nasce como no cadastro.
    const inicial = preset ?? await lerPreset(svc, null)
    if (inicial) await aplicarPreset(svc, empresa.id, inicial)
  } else if (preset) {
    await svc.from('empresas').update({ preset_onboarding: preset.chave, nome } as never).eq('id', empresa.id)
    const { error: errPreset } = await aplicarPreset(svc, empresa.id, preset, { substituir: true })
    if (errPreset) return NextResponse.json({ error: `Falha ao aplicar o preset: ${errPreset}` }, { status: 500 })
  }

  // Mesma RPC do fluxo de impersonar empresa.
  const { error: impErr } = await supabase.rpc('set_impersonation', { p_empresa_id: empresa.id, p_ttl_seconds: TTL_SECONDS })
  if (impErr) return NextResponse.json({ error: `Falha ao entrar: ${impErr.message}` }, { status: 500 })

  await logSuperAdminAction({
    adminUserId: userId, empresaId: empresa.id,
    acao: preset ? 'preview_preset' : 'laboratorio',
    detalhes: preset ? { chave: preset.chave } : {},
  })

  const res = NextResponse.json({ ok: true, empresaId: empresa.id })
  res.cookies.set(IMPERSONATE_COOKIE, String(empresa.id), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TTL_SECONDS })
  return res
}
