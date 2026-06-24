import Stripe from 'stripe'

// ─── Lazy client — só instancia quando chamado, não no build ─
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY não configurada')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil',
      typescript: true,
    })
  }
  return _stripe
}

export type PlanoId = string

// ─── Busca planos do banco ────────────────────────────────────
export async function getPlanos() {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data } = await supabase
    .from('planos_config')
    .select('id, nome, preco_centavos, stripe_price_id, limite_usuarios, limite_leads')
    .eq('ativo', true)
    .order('ordem')
  return data ?? []
}

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
export async function stripeStatusToPlano(
  stripeStatus: string,
  priceId: string | null
): Promise<{ plano: PlanoId; status: string; stripe_status: string }> {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') {
    let plano: PlanoId = 'free'
    if (priceId) {
      const planos = await getPlanos()
      const found = planos.find(p => p.stripe_price_id === priceId)
      if (found) plano = found.id
    }
    return { plano, status: 'ativo', stripe_status: stripeStatus }
  }
  if (stripeStatus === 'past_due') {
    return { plano: 'free', status: 'ativo', stripe_status: 'past_due' }
  }
  return { plano: 'free', status: 'suspenso', stripe_status: stripeStatus }
}
