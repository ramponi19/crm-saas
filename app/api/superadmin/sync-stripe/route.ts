import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/superadmin'
import { getStripe, stripeStatusToPlano } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'

// Manual trigger for the sync-stripe reconciliation job.
// Useful when a Stripe webhook was missed and the cron cadence (daily on Hobby plan) is too slow.
export async function POST() {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: true, atualizadas: 0, erros: [], nota: 'Stripe não configurado' })
  }

  const supabase = createServiceClient()
  const stripe = getStripe()

  const { data: empresas, error } = await supabase
    .from('empresas')
    .select('id, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let atualizadas = 0
  const erros: string[] = []

  for (const emp of empresas ?? []) {
    try {
      const sub = await stripe.subscriptions.retrieve(emp.stripe_subscription_id as string)
      const priceId = sub.items.data[0]?.price?.id ?? null
      const { plano, status, stripe_status } = await stripeStatusToPlano(sub.status, priceId)
      await supabase.from('empresas').update({ plano, status, stripe_status }).eq('id', emp.id)
      atualizadas++
    } catch (err) {
      erros.push(`empresa ${emp.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({ ok: true, atualizadas, erros })
}
