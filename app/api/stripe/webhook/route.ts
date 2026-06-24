import { NextRequest, NextResponse } from 'next/server'
import { getStripe, stripeStatusToPlano } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import Stripe from 'stripe'
import type { Json } from '@/types/database'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event
  const stripe = getStripe()

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] assinatura inválida:', err)
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: jaProcessado } = await supabase
    .from('stripe_eventos')
    .select('id')
    .eq('id', event.id)
    .single()

  if (jaProcessado) return NextResponse.json({ ok: true, duplicado: true })

  // empresa_id é resolvido por tipo de evento e persistido no log (corrige bug
  // anterior em que stripe_eventos.empresa_id era sempre null).
  let empresaIdEvento: number | null = null

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const empresaId = Number(sub.metadata?.empresa_id)
        if (!empresaId) break
        empresaIdEvento = empresaId
        const priceId = sub.items.data[0]?.price?.id ?? null
        const { plano, status, stripe_status } = stripeStatusToPlano(sub.status, priceId)
        await supabase.from('empresas').update({
          plano, status, stripe_status,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        }).eq('id', empresaId)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const empresaId = Number(sub.metadata?.empresa_id)
        if (!empresaId) break
        empresaIdEvento = empresaId
        await supabase.from('empresas').update({
          plano: 'free', status: 'ativo', stripe_status: 'canceled',
          stripe_subscription_id: null, stripe_price_id: null,
        }).eq('id', empresaId)
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const { data: emp } = await supabase.from('empresas')
          .update({ stripe_status: 'active', status: 'ativo' })
          .eq('stripe_customer_id', invoice.customer as string)
          .select('id')
          .single()
        empresaIdEvento = emp?.id ?? null
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const { data: emp } = await supabase.from('empresas')
          .update({ stripe_status: 'past_due' })
          .eq('stripe_customer_id', invoice.customer as string)
          .select('id')
          .single()
        empresaIdEvento = emp?.id ?? null
        break
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const empresaId = Number(session.metadata?.empresa_id)
        if (empresaId && session.customer) {
          empresaIdEvento = empresaId
          await supabase.from('empresas').update({ stripe_customer_id: session.customer as string }).eq('id', empresaId)
        }
        break
      }
    }

    await supabase.from('stripe_eventos').insert({
      id: event.id,
      tipo: event.type,
      empresa_id: empresaIdEvento,
      payload: event.data.object as unknown as Json,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook] erro:', event.type, err)
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
