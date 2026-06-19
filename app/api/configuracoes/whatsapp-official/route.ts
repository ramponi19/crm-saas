import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const supabase = await createClient()

    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert(
        { chave: 'whatsapp_official', valor: body, updated_at: new Date().toISOString() },
        { onConflict: 'chave' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
