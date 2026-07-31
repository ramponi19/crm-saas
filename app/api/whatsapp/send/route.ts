import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const empresaId = await getEmpresaId()

    const { to, message } = await req.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const result = await sendWhatsApp({ to, message, empresaId })
    // Propaga o status real: se o WhatsApp não está conectado ou a Graph falhou,
    // NÃO devolver 200 — senão a loja vê "enviado" e o cliente não recebe.
    return NextResponse.json(result, { status: result.success ? 200 : 502 })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
