import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getStripe, getPlanos, getOrCreateCustomer, PlanoId } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { planoId } = await req.json() as { planoId: PlanoId }
    const planos = await getPlanos()
    const plano = planos.find(p => p.id === planoId)

    if (!plano || plano.preco_centavos === 0 || !plano.stripe_price_id) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }

    const { data: empresaData } = await supabase
      .from('empresas')
      .select('id, nome, stripe_customer_id, stripe_subscription_id, stripe_status')
      .eq('id', empresaId)
      .single()

    if (!empresaData) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

    // Block duplicate subscriptions — active or trialing subscriptions must be managed via the portal
    const activeStatuses = ['active', 'trialing', 'past_due']
    if (empresaData.stripe_subscription_id && activeStatuses.includes(empresaData.stripe_status ?? '')) {
      return NextResponse.json(
        { error: 'Sua empresa já possui uma assinatura ativa. Use o portal de cobrança para fazer alterações.' },
        { status: 409 }
      )
    }

    const customerId = await getOrCreateCustomer(empresaId, empresaData.nome, user.email!)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plano.stripe_price_id, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { empresa_id: String(empresaId) },
      },
      metadata: { empresa_id: String(empresaId), plano_id: planoId },
      success_url: `${baseUrl}/planos/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/planos`,
      locale: 'pt-BR',
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[checkout]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
