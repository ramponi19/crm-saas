import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'

// Liga/desliga a régua de follow-up automática da empresa.
// Grava em configuracoes_sistema (chave 'regua_followup' = { ativo: boolean }).
// O cron /api/cron/gerar-followups respeita { ativo:false } como kill switch.
export async function POST(req: NextRequest) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const { empresaId, supabase } = auth

  const body = await req.json().catch(() => ({}))
  const ativo = body?.ativo === true

  const { error } = await supabase.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: 'regua_followup', valor: { ativo } },
    { onConflict: 'empresa_id,chave' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, ativo })
}
