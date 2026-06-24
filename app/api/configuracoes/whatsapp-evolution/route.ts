import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert(
        { chave: 'whatsapp_evolution', valor: body, empresa_id: empresaId, updated_at: new Date().toISOString() },
        { onConflict: 'empresa_id,chave' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
