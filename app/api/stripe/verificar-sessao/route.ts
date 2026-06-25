import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('session_id')
    if (!sessionId) return NextResponse.json({ error: 'session_id obrigatório' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const empresaId = await getEmpresaId()
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Confirm the session belongs to this empresa
    if (session.metadata?.empresa_id !== String(empresaId)) {
      return NextResponse.json({ error: 'Sessão não pertence a esta empresa' }, { status: 403 })
    }

    const ok = session.payment_status === 'paid' || session.status === 'complete'
    return NextResponse.json({ ok, status: session.status, payment_status: session.payment_status })
  } catch (err) {
    console.error('[verificar-sessao]', err)
    return NextResponse.json({ error: 'Erro ao verificar sessão' }, { status: 500 })
  }
}
