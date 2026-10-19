import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { mesclarSegredos } from '@/lib/segredos'

// Grava a configuração manual de um canal (WhatsApp oficial, Instagram, Messenger)
// da tela de Configurações. A tela não recebe mais os tokens: campo secreto que
// chega em branco mantém o valor que já está no banco.
const CHAVES = new Set(['whatsapp_official', 'meta_instagram', 'meta_messenger'])

export async function POST(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth

  const body = await req.json().catch(() => null) as { chave?: string; valor?: Record<string, unknown> } | null
  if (!body?.chave || !CHAVES.has(body.chave) || !body.valor || typeof body.valor !== 'object') {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { data: atual } = await supabase.from('configuracoes_sistema')
    .select('valor').eq('empresa_id', empresaId).eq('chave', body.chave).maybeSingle()
  const valor = mesclarSegredos(body.valor, atual?.valor)

  const { error } = await supabase.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: body.chave, valor: valor as never, updated_at: new Date().toISOString() },
    { onConflict: 'empresa_id,chave' },
  )
  if (error) return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
