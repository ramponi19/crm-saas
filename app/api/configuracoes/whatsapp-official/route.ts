import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'

export async function POST(req: Request) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { supabase, empresaId } = auth
    const body = await req.json()

    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert(
        { chave: 'whatsapp_official', valor: body, empresa_id: empresaId, updated_at: new Date().toISOString() },
        { onConflict: 'empresa_id,chave' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
