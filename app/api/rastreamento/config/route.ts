import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { rastrDb } from '@/lib/rastreamento/db'
import { cifrarToken, cofreConfigurado } from '@/lib/canais/crypto'

/**
 * Config do pixel/CAPI da empresa (somente owner/admin).
 * GET  → devolve a config (cria uma com token novo se ainda não existir).
 * PATCH→ atualiza pixel_id, ativa/desativa CAPI e grava o token CAPI cifrado.
 */
export async function GET() {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const db = rastrDb()

  let { data } = await db.from('rastreamento_config')
    .select('empresa_id, public_token, meta_pixel_id, capi_ativo, capi_test_code, capi_token_enc, ativo')
    .eq('empresa_id', auth.empresaId).maybeSingle()

  if (!data) {
    const ins = await db.from('rastreamento_config')
      .insert({ empresa_id: auth.empresaId })
      .select('empresa_id, public_token, meta_pixel_id, capi_ativo, capi_test_code, capi_token_enc, ativo')
      .single()
    data = ins.data
  }

  return NextResponse.json({
    empresa_id: data?.empresa_id,
    public_token: data?.public_token,
    meta_pixel_id: data?.meta_pixel_id ?? '',
    capi_ativo: !!data?.capi_ativo,
    capi_test_code: data?.capi_test_code ?? '',
    tem_token: !!data?.capi_token_enc,
    ativo: data?.ativo !== false,
    cofre_ok: cofreConfigurado(),
  })
}

export async function PATCH(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if ('meta_pixel_id' in body) patch.meta_pixel_id = String(body.meta_pixel_id ?? '').trim() || null
  if ('capi_ativo' in body) patch.capi_ativo = !!body.capi_ativo
  if ('capi_test_code' in body) patch.capi_test_code = String(body.capi_test_code ?? '').trim() || null
  if ('ativo' in body) patch.ativo = !!body.ativo

  // Token CAPI: só grava se veio um valor novo; string vazia limpa o token.
  if ('capi_token' in body) {
    const raw = String(body.capi_token ?? '').trim()
    if (raw === '') patch.capi_token_enc = null
    else {
      try { patch.capi_token_enc = cifrarToken(raw) }
      catch { return NextResponse.json({ error: 'cofre_indisponivel' }, { status: 500 }) }
    }
  }

  const db = rastrDb()
  await db.from('rastreamento_config')
    .upsert({ empresa_id: auth.empresaId, ...patch }, { onConflict: 'empresa_id' })

  return NextResponse.json({ ok: true })
}
