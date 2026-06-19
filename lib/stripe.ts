import Stripe from 'stripe'

// Cliente Stripe (server-side only)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
  typescript: true,
})

// ─── IDs dos produtos/preços no Stripe ───────────────────────
// Após criar os produtos no Stripe Dashboard, cole os Price IDs aqui
// ou defina as env vars STRIPE_PRICE_STARTER e STRIPE_PRICE_PRO
export const PLANOS = {
  free: {
    nome: 'Free',
    preco: 0,
    priceId: null,
    limites: { usuarios: 1, leads: 100 },
  },
  starter: {
    nome: 'Starter',
    preco: 19700, // em centavos = R$ 197,00
    priceId: process.env.STRIPE_PRICE_STARTER ?? '',
    limites: { usuarios: 3, leads: 500 },
  },
  pro: {
    nome: 'Pro',
    preco: 39700, // em centavos = R$ 397,00
    priceId: process.env.STRIPE_PRICE_PRO ?? '',
    limites: { usuarios: 999, leads: 99999 },
  },
} as const

export type PlanoId = keyof typeof PLANOS

// ─── Criar ou recuperar customer Stripe ──────────────────────
export async function getOrCreateCustomer(empresaId: number, nome: string, email: string) {
  // Busca no banco se já tem customer_id
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: empresa } = await supabase
    .from('empresas')
    .select('stripe_customer_id')
    .eq('id', empresaId)
    .single()

  if (empresa?.stripe_customer_id) {
    return empresa.stripe_customer_id
  }

  // Cria novo customer no Stripe
  const customer = await stripe.customers.create({
    name: nome,
    email,
    metadata: { empresa_id: String(empresaId) },
  })

  // Salva no banco
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
