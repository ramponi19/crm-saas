import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { getStripe, getPlanos, getOrCreateCustomer, PlanoId } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId, supabase } = auth
    const { data: { user } } = await supabase.auth.getUser()

    const { planoId } = await req.json() as { planoId: PlanoId }
    const planos = await getPlanos()
    const plano = planos.find(p => p.id === planoId)

    if (!plano || plano.preco_centavos === 0) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }
    // Pronto para cobrar (17/11/2026): falta só o preço de cada plano no Stripe (planos_config.stripe_price_id,
    // decisão do Lucas). Sem ele, o plano ainda não está à venda — e a tela diz isso, sem erro genérico.
    if (!plano.stripe_price_id) {
      return NextResponse.json({ error: `O plano ${plano.nome} ainda não está à venda. Fale com o suporte.`, code: 'plano_sem_preco' }, { status: 409 })
    }

    const { data: empresaData } = await supabase
      .from('empresas')
      .select('id, nome, stripe_customer_id, stripe_subscription_id, stripe_status, trial_ends_at')
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

    const customerId = await getOrCreateCustomer(empresaId, empresaData.nome, user?.email ?? '')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plano.stripe_price_id, quantity: 1 }],
      subscription_data: {
        // O teste já corre desde o cadastro (14 dias): a assinatura continua o que falta dele, sem dar outro.
        // Teste vencido (ou a menos de 2 dias, mínimo do Stripe) = cobra já.
        ...(empresaData.trial_ends_at && new Date(empresaData.trial_ends_at).getTime() > Date.now() + 2 * 86_400_000
          ? { trial_end: Math.floor(new Date(empresaData.trial_ends_at).getTime() / 1000) }
          : {}),
        metadata: { empresa_id: String(empresaId) },
      },
      metadata: { empresa_id: String(empresaId), plano_id: planoId },
      success_url: `${baseUrl}/configuracoes/faturamento/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/configuracoes/faturamento`,
      locale: 'pt-BR',
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[checkout]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
