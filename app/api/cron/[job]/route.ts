import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe, stripeStatusToPlano } from '@/lib/stripe'
import { atualizarReferencia } from '@/lib/fipe'
import { renovarTokensInstagram } from '@/lib/canais/renovacao'
import { rodarRetencao } from '@/lib/storage/retencao'
import { montarPonte, gravarPonte } from '@/lib/zapintel/ponte'
import { timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MODULO_INTELIGENCIA } from '@/lib/empresa-config'

// ============================================================
// Cron jobs de manutenção. Protegidos por CRON_SECRET.
// Vercel Cron envia o header 'authorization: Bearer <CRON_SECRET>'.
// Jobs: expirar-trials | arquivar-eventos | sync-stripe
//       sync-fipe | renovar-tokens | reter-audio | ponte-vendas
// ============================================================

function verificarCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Falha segura: se a variável não estiver configurada, bloqueia tudo
  if (!secret) return false
  const expected = `Bearer ${secret}`
  const received = req.headers.get('authorization') ?? ''
  if (received.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  if (!verificarCronSecret(req)) {
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
        // Remove eventos Stripe com mais de 90 dias (já processados).
        //
        // Filtrava por `created_at`, coluna que `stripe_eventos` não tem — a
        // data dela é `processado_em`. O job falhava todo dia desde setembro
        // com "Erro no cron" no log, sem apagar nada (achado em 14/10/2026).
        const corte = new Date()
        corte.setDate(corte.getDate() - 90)
        const { data, error } = await supabase
          .from('stripe_eventos')
          .delete()
          .lt('processado_em', corte.toISOString())
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

      case 'sync-fipe': {
        // Revalida o mês de referência da FIPE (barato: 1 request). Os valores em si
        // são cacheados sob demanda em fipe_consultas ao serem consultados.
        const { codigo, mes } = await atualizarReferencia(supabase)
        return NextResponse.json({ ok: true, job, codigo, mes })
      }

      case 'renovar-tokens': {
        /**
         * O token do Instagram conectado por login vale 60 DIAS. O da Página
         * nao expira — por isso este job so existe depois do conector novo.
         *
         * Sem ele, todo Instagram de todo cliente cai sozinho dois meses depois
         * de conectar, sem erro em tela: o lojista so percebe pelo silencio.
         */
        const r = await renovarTokensInstagram(supabase)
        if (r.falhas.length) console.error('[cron/renovar-tokens] falhas:', JSON.stringify(r.falhas))
        return NextResponse.json({ ok: true, job, ...r })
      }

      case 'reter-audio': {
        /**
         * O SOM SAI, O TEXTO FICA.
         *
         * O bucket `chat-midia` chegou a 940,9 MB de 1.024 em 14/10/2026 —
         * quatro dias do teto. Audio era 475,5 MB, e tudo ja estava
         * transcrito: 475 MB de som equivalem a 2,4 MB de texto no banco.
         *
         * A primeira limpeza foi manual e tirou 412,9 MB de uma vez. Este job
         * existe para que isso nao precise acontecer de novo em pânico: todo
         * dia ele tira o que completou a janela, e o bucket fica estavel.
         *
         * Nada sai sem transcricao e nada sai sem registro — ver
         * `lib/storage/retencao.ts`, que o script manual usa tambem.
         * Um caminho so.
         */
        const r = await rodarRetencao(supabase)
        if (r.falhas) console.error('[cron/reter-audio] falhas:', r.falhas)
        return NextResponse.json({ ok: true, job, ...r })
      }

      case 'ponte-vendas': {
        /**
         * A PONTE VENDA↔CONVERSA NÃO PODE DEPENDER DE ALGUÉM RODAR UM SCRIPT.
         *
         * Medido em 14/10/2026: a ponte tinha sido gravada pela última vez em
         * 10/10, pelo script manual. Toda venda de 11 a 14/10 estava fora
         * dela — e o dashboard do ZapIntel (conversão, "compraram e o CRM não
         * tem a venda", ticket) tira tudo isso daqui. Rodado à mão naquele
         * dia: 45 de 62 vendas ligadas a uma conversa, contra 33.
         *
         * Uma vez por dia (o limite do plano). `gravarPonte` só acrescenta ou
         * atualiza, e nunca mexe numa ligação confirmada à mão.
         */
        const { data: ativas, error } = await supabase
          .from('empresa_modulos').select('empresa_id').eq('modulo', MODULO_INTELIGENCIA).eq('ativo', true)
        if (error) throw error
        const resultado: { empresa: number; vendas: number; gravadas: number }[] = []
        for (const { empresa_id } of (ativas ?? []) as { empresa_id: number }[]) {
          const linhas = await montarPonte(supabase as unknown as SupabaseClient, empresa_id)
          const gravadas = await gravarPonte(supabase as unknown as SupabaseClient, linhas)
          resultado.push({ empresa: empresa_id, vendas: linhas.length, gravadas })
        }
        return NextResponse.json({ ok: true, job, resultado })
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
