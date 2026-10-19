import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { mesclarSegredos } from '@/lib/segredos'

export async function POST(req: Request) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { supabase, empresaId } = auth
    const body = await req.json()

    // Segredo em branco mantém o atual: a tela de Configurações não recebe mais o token.
    const { data: atual } = await supabase.from('configuracoes_sistema')
      .select('valor').eq('empresa_id', empresaId).eq('chave', 'whatsapp_official').maybeSingle()
    const valor = mesclarSegredos(body, atual?.valor)

    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert(
        { chave: 'whatsapp_official', valor: valor as never, empresa_id: empresaId, updated_at: new Date().toISOString() },
        { onConflict: 'empresa_id,chave' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
