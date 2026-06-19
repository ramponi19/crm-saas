import Stripe from 'stripe'

// ─── Lazy client — só instancia quando chamado, não no build ─
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY não configurada')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-05-28.basil',
      typescript: true,
    })
  }
  return _stripe
}

// ─── IDs dos produtos/preços no Stripe ───────────────────────
export const PLANOS = {
  free: {
    nome: 'Free',
    preco: 0,
    priceId: null as string | null,
    limites: { usuarios: 1, leads: 100 },
  },
  starter: {
    nome: 'Starter',
    preco: 19700,
    get priceId() { return process.env.STRIPE_PRICE_STARTER ?? '' },
    limites: { usuarios: 3, leads: 500 },
  },
  pro: {
    nome: 'Pro',
    preco: 39700,
    get priceId() { return process.env.STRIPE_PRICE_PRO ?? '' },
    limites: { usuarios: 999, leads: 99999 },
  },
} as const

export type PlanoId = keyof typeof PLANOS

// ─── Criar ou recuperar customer Stripe ──────────────────────
export async function getOrCreateCustomer(empresaId: number, nome: string, email: string) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: empresa } = await supabase
    .from('empresas')
    .select('stripe_customer_id')
    .eq('id', empresaId)
    .single()

  if ((empresa as unknown as { stripe_customer_id: string | null })?.stripe_customer_id) {
    return (empresa as unknown as { stripe_customer_id: string }).stripe_customer_id
  }

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    name: nome,
    email,
    metadata: { empresa_id: String(empresaId) },
  })

  await supabase
    .from('empresas')
    .update({ stripe_customer_id: customer.id })
    .eq('id', empresaId)

  return customer.id
}

// ─── Mapeia stripe_status → plano ────────────────────────────
export function stripeStatusToPlano(
  stripeStatus: string,
  priceId: string | null
): { plano: PlanoId; status: string; stripe_status: string } {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') {
    const plano = priceId === PLANOS.pro.priceId ? 'pro'
                : priceId === PLANOS.starter.priceId ? 'starter'
                : 'free'
    return { plano, status: 'ativo', stripe_status: stripeStatus }
  }
  if (stripeStatus === 'past_due') {
    return { plano: 'free', status: 'ativo', stripe_status: 'past_due' }
  }
  return { plano: 'free', status: 'suspenso', stripe_status: stripeStatus }
}
