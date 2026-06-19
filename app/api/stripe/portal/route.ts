import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: vinculo } = await supabase
      .from('empresa_usuarios')
      .select('empresa_id, empresas(stripe_customer_id)')
      .eq('usuario_id', user.id)
      .eq('ativo', true)
      .single()

    const empresaData = (vinculo as unknown as { empresas: { stripe_customer_id: string | null } })?.empresas
    const customerId = empresaData?.stripe_customer_id

    if (!customerId) {
      return NextResponse.json({ error: 'Sem assinatura ativa' }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/planos`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[portal]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
