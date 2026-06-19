import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, PLANOS, getOrCreateCustomer, PlanoId } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { planoId } = await req.json() as { planoId: PlanoId }
    const plano = PLANOS[planoId]

    if (!plano || plano.preco === 0 || !plano.priceId) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }

    const { data: vinculo } = await supabase
      .from('empresa_usuarios')
      .select('empresa_id, empresas(id, nome, stripe_customer_id)')
      .eq('usuario_id', user.id)
      .eq('ativo', true)
      .single()

    if (!vinculo) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

    const empresaData = (vinculo as unknown as { empresas: { id: number; nome: string; stripe_customer_id: string | null } }).empresas
    const empresaId = empresaData.id
    const customerId = await getOrCreateCustomer(empresaId, empresaData.nome, user.email!)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plano.priceId as string, quantity: 1 }],
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
