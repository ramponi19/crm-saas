import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId, supabase } = auth

    const { data: empresa } = await supabase
      .from('empresas')
      .select('stripe_customer_id')
      .eq('id', empresaId)
      .single()

    const customerId = empresa?.stripe_customer_id

    if (!customerId) {
      return NextResponse.json({ error: 'Sem assinatura ativa' }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const stripe = getStripe()

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/admin/planos`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[portal]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
