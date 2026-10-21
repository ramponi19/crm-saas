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

// ─── Reconciliar assinaturas Stripe → empresas ──────────────
/**
 * Atualiza plano/status das empresas com assinatura, corrigindo o que um
 * webhook perdido deixou para trás. UM lugar só: o cron diário (`sync-stripe`)
 * e o botão do superadmin rodavam cópias do mesmo laço (etapa 0, 21/10/2026).
 * Quem chama decide a autenticação; aqui é só o trabalho.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reconciliarAssinaturas(supabase: any): Promise<{ atualizadas: number; erros: string[] }> {
  const stripe = getStripe()
  const { data: empresas, error } = await supabase
    .from('empresas')
    .select('id, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)
  if (error) throw error

  let atualizadas = 0
  const erros: string[] = []
  for (const emp of (empresas ?? []) as Array<{ id: number; stripe_subscription_id: string }>) {
    try {
      const sub = await stripe.subscriptions.retrieve(emp.stripe_subscription_id)
      const priceId = sub.items.data[0]?.price?.id ?? null
      const { plano, status, stripe_status } = await stripeStatusToPlano(sub.status, priceId)
      await supabase.from('empresas').update({ plano, status, stripe_status }).eq('id', emp.id)
      atualizadas++
    } catch (err) {
      // Assinatura cancelada ou inválida: segue para a próxima.
      erros.push(`empresa ${emp.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { atualizadas, erros }
}
