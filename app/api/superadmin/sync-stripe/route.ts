import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/superadmin'
import { reconciliarAssinaturas } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'

// Manual trigger for the sync-stripe reconciliation job.
// Useful when a Stripe webhook was missed and the cron cadence (daily on Hobby plan) is too slow.
// Same work as the cron (lib/stripe.ts reconciliarAssinaturas); only the auth differs.
export async function POST() {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: true, atualizadas: 0, erros: [], nota: 'Stripe não configurado' })
  }

  try {
    const { atualizadas, erros } = await reconciliarAssinaturas(createServiceClient())
    return NextResponse.json({ ok: true, atualizadas, erros })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao reconciliar' }, { status: 500 })
  }
}
