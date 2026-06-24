import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe, stripeStatusToPlano } from '@/lib/stripe'

// ============================================================
// Cron jobs de manutenção. Protegidos por CRON_SECRET.
// Vercel Cron envia o header 'authorization: Bearer <CRON_SECRET>'.
// Jobs: expirar-trials | arquivar-eventos | sync-stripe
// ============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { job } = await params
  const supabase = createServiceClient()

  try {
    switch (job) {
      case 'expirar-trials': {
        // Empresas em trial cujo trial_ends_at já passou e que não têm assinatura ativa → suspenso
        const agora = new Date().toISOString()
        const { data, error } = await supabase
          .from('empresas')
          .update({ status: 'suspenso', stripe_status: 'trial_expired' })
          .lt('trial_ends_at', agora)
          .eq('status', 'ativo')
          .is('stripe_subscription_id', null)
          .select('id')
        if (error) throw error
        return NextResponse.json({ ok: true, job, suspensas: data?.length ?? 0 })
      }

      case 'arquivar-eventos': {
        // Remove eventos Stripe com mais de 90 dias (já processados)
        const corte = new Date()
        corte.setDate(corte.getDate() - 90)
        const { data, error } = await supabase
          .from('stripe_eventos')
          .delete()
          .lt('created_at', corte.toISOString())
          .select('id')
        if (error) throw error
        return NextResponse.json({ ok: true, job, removidos: data?.length ?? 0 })
      }

      case 'sync-stripe': {
        // Reconcilia assinaturas Stripe → empresas: atualiza plano/status para
        // empresas com stripe_subscription_id, corrigindo divergências causadas
        // por webhooks perdidos ou falhas transitórias.
        if (!process.env.STRIPE_SECRET_KEY) {
          return NextResponse.json({ ok: true, job, nota: 'Stripe não configurado' })
        }
        const stripe = getStripe()
        const { data: empresas, error: eErr } = await supabase
          .from('empresas')
          .select('id, stripe_subscription_id')
          .not('stripe_subscription_id', 'is', null)
        if (eErr) throw eErr

        let atualizadas = 0
        for (const emp of empresas ?? []) {
          try {
            const sub = await stripe.subscriptions.retrieve(emp.stripe_subscription_id as string)
            const priceId = sub.items.data[0]?.price?.id ?? null
            const { plano, status, stripe_status } = await stripeStatusToPlano(sub.status, priceId)
            await supabase.from('empresas').update({ plano, status, stripe_status }).eq('id', emp.id)
            atualizadas++
          } catch { /* assinatura cancelada ou inválida — ignora */ }
        }
        return NextResponse.json({ ok: true, job, atualizadas })
      }

      default:
        return NextResponse.json({ error: 'Job desconhecido' }, { status: 404 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro no cron'
    console.error(`[cron/${job}]`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
