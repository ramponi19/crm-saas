import { NextRequest, NextResponse } from 'next/server'
import { stripe, stripeStatusToPlano } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

// Stripe requer o body raw para validar a assinatura
export const config = { api: { bodyParser: false } }

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] assinatura inválida:', err)
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 })
  }

  const supabase = await createClient()

  // Idempotência: ignora eventos já processados
  const { data: jaProcessado } = await supabase
    .from('stripe_eventos')
    .select('id')
    .eq('id', event.id)
    .single()

  if (jaProcessado) {
    return NextResponse.json({ ok: true, duplicado: true })
  }

  // Processa evento
  try {
    switch (event.type) {

      // ── Assinatura criada ou atualizada ──────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const empresaId = Number(sub.metadata?.empresa_id)
        if (!empresaId) break

        const priceId = sub.items.data[0]?.price?.id ?? null
        const { plano, status, stripe_status } = stripeStatusToPlano(sub.status, priceId)

        await supabase.from('empresas').update({
          plano,
          status,
          stripe_status,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          // Atualiza trial_ends_at se vier do Stripe
          trial_ends_at: sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
        }).eq('id', empresaId)

        break
      }

      // ── Assinatura cancelada ──────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const empresaId = Number(sub.metadata?.empresa_id)
        if (!empresaId) break

        await supabase.from('empresas').update({
          plano: 'free',
          status: 'ativo',
          stripe_status: 'canceled',
          stripe_subscription_id: null,
          stripe_price_id: null,
        }).eq('id', empresaId)

        break
      }

      // ── Pagamento bem-sucedido ────────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        await supabase.from('empresas').update({
          stripe_status: 'active',
          status: 'ativo',
        }).eq('stripe_customer_id', customerId)

        break
      }

      // ── Pagamento falhou ──────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        await supabase.from('empresas').update({
          stripe_status: 'past_due',
        }).eq('stripe_customer_id', customerId)

        break
      }

      // ── Checkout completado ───────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const empresaId = Number(session.metadata?.empresa_id)
        const customerId = session.customer as string

        if (empresaId && customerId) {
          await supabase.from('empresas').update({
            stripe_customer_id: customerId,
          }).eq('id', empresaId)
        }
        break
      }
    }

    // Registra evento processado
    await supabase.from('stripe_eventos').insert({
      id: event.id,
      tipo: event.type,
      empresa_id: Number(
        (event.data.object as Record<string, unknown>)?.['metadata'] &&
        ((event.data.object as Stripe.Subscription)?.metadata?.empresa_id)
      ) || null,
      payload: event.data.object as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook] erro ao processar:', event.type, err)
    return NextResponse.json({ error: 'Erro ao processar' }, { status: 500 })
  }
}
