import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe, stripeStatusToPlano } from '@/lib/stripe'
import { executarAcao } from '@/lib/automacoes'
import { atualizarReferencia } from '@/lib/fipe'
import { timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Cron jobs de manutenção. Protegidos por CRON_SECRET.
// Vercel Cron envia o header 'authorization: Bearer <CRON_SECRET>'.
// Jobs: expirar-trials | arquivar-eventos | sync-stripe
// ============================================================

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

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

      case 'gerar-followups': {
        // Régua de follow-up: gera tarefas automáticas por empresa, de forma
        // idempotente (followups_gerados.chave é unique → nunca duplica).
        // Só cria tarefas INTERNAS — não envia nada pra Meta/WhatsApp.
        // Kill switch por empresa: configuracoes_sistema chave 'regua_followup'
        // com valor {ativo:false} desliga a régua daquela empresa.
        const now = new Date()
        const nowIso = now.toISOString()
        const DIA = 24 * 3600 * 1000
        const h24 = new Date(now.getTime() - DIA).toISOString()
        const d3 = new Date(now.getTime() - 3 * DIA).toISOString()
        // Janelas superiores: não perseguimos registros antigos (evita enxurrada de
        // backfill e ruído — lead/visita parado há semanas já é caso perdido/frio).
        const d7 = new Date(now.getTime() - 7 * DIA).toISOString()
        const d14 = new Date(now.getTime() - 14 * DIA).toISOString()

        const { data: cfgs } = await supabase
          .from('configuracoes_sistema').select('empresa_id, valor').eq('chave', 'regua_followup')
        const desativadas = new Set(
          ((cfgs ?? []) as Array<{ empresa_id: number; valor: { ativo?: boolean } | null }>)
            .filter(c => c.valor?.ativo === false).map(c => c.empresa_id)
        )

        // Cria a tarefa + marca a chave de forma idempotente. Retorna 1 se criou, 0 se já existia.
        async function gerar(args: { empresaId: number; leadId: number; responsavelId: string | null; regra: string; chave: string; titulo: string }): Promise<number> {
          const { data: marca } = await supabase
            .from('followups_gerados')
            .upsert({ empresa_id: args.empresaId, lead_id: args.leadId, regra: args.regra, chave: args.chave }, { onConflict: 'chave', ignoreDuplicates: true })
            .select('id').maybeSingle()
          if (!marca) return 0 // chave já existia → nada a fazer
          const { data: tarefa, error: tErr } = await supabase
            .from('tarefas')
            .insert({ empresa_id: args.empresaId, lead_id: args.leadId, responsavel_id: args.responsavelId, titulo: args.titulo, tipo: 'ligacao', vencimento: nowIso })
            .select('id').single()
          if (tErr || !tarefa) {
            // Falha ao criar a tarefa → remove a marca pra tentar de novo no próximo cron
            // (evita perda silenciosa: a chave ficaria gravada bloqueando o retry pra sempre).
            await supabase.from('followups_gerados').delete().eq('id', marca.id)
            return 0
          }
          await supabase.from('followups_gerados').update({ tarefa_id: tarefa.id }).eq('id', marca.id)
          return 1
        }

        let criadas = 0

        // Regra 1 — lead novo há +24h ainda na primeira etapa ('novo'): cobrar primeiro contato.
        const { data: leadsNovos } = await supabase
          .from('leads').select('id, empresa_id, nome, responsavel_id')
          .eq('ativo', true).eq('kanban_status', 'novo')
          .lt('created_at', h24).gte('created_at', d7).limit(500)
        for (const l of (leadsNovos ?? []) as Array<{ id: number; empresa_id: number; nome: string | null; responsavel_id: string | null }>) {
          if (desativadas.has(l.empresa_id)) continue
          criadas += await gerar({
            empresaId: l.empresa_id, leadId: l.id, responsavelId: l.responsavel_id,
            regra: 'primeiro_contato', chave: `primeiro_contato:lead:${l.id}`,
            titulo: `Fazer primeiro contato com ${l.nome ?? 'lead'}`,
          })
        }

        // Regra 2 — visita realizada há +3 dias e lead ainda não avançou p/ proposta: cobrar retomada.
        const jaAvancou = ['proposta', 'credito', 'fechamento', 'perdido']
        const { data: visitasRaw } = await supabase
          .from('visitas').select('id, empresa_id, lead_id, corretor_id, leads(nome, kanban_status, responsavel_id, ativo)')
          .eq('status', 'realizada').lt('data_hora', d3).gte('data_hora', d14).limit(500)
        type VisRow = { id: number; empresa_id: number; lead_id: number | null; corretor_id: string | null; leads: Embed<{ nome: string | null; kanban_status: string | null; responsavel_id: string | null; ativo: boolean | null }> }
        for (const v of (visitasRaw ?? []) as unknown as VisRow[]) {
          if (!v.lead_id || desativadas.has(v.empresa_id)) continue
          const lead = one(v.leads)
          if (!lead || lead.ativo === false) continue
          if (jaAvancou.includes(lead.kanban_status ?? '')) continue
          criadas += await gerar({
            empresaId: v.empresa_id, leadId: v.lead_id, responsavelId: lead.responsavel_id ?? v.corretor_id,
            regra: 'pos_visita', chave: `pos_visita:lead:${v.lead_id}`,
            titulo: `Retomar ${lead.nome ?? 'cliente'} após a visita (enviar proposta)`,
          })
        }

        // Regra 3 — confirmação D-1: consultas/visitas de AMANHÃ → tarefa de confirmar
        // (útil p/ saúde e imob; varejo não tem visitas, então não gera ruído).
        const amanhaIni = new Date(now); amanhaIni.setDate(now.getDate() + 1); amanhaIni.setHours(0, 0, 0, 0)
        const amanhaFim = new Date(amanhaIni); amanhaFim.setHours(23, 59, 59, 999)
        const { data: consultasAmanha } = await supabase
          .from('visitas')
          .select('id, empresa_id, lead_id, corretor_id, data_hora, status, leads(nome, responsavel_id)')
          .gte('data_hora', amanhaIni.toISOString()).lte('data_hora', amanhaFim.toISOString())
          .limit(500)
        type ConsRow = { id: number; empresa_id: number; lead_id: number | null; corretor_id: string | null; data_hora: string; status: string | null; leads: Embed<{ nome: string | null; responsavel_id: string | null }> }
        for (const v of (consultasAmanha ?? []) as unknown as ConsRow[]) {
          if (!v.lead_id || desativadas.has(v.empresa_id)) continue
          if (['realizada', 'cancelada'].includes(v.status ?? '')) continue
          const lead = one(v.leads)
          const quando = new Date(v.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          criadas += await gerar({
            empresaId: v.empresa_id, leadId: v.lead_id, responsavelId: lead?.responsavel_id ?? v.corretor_id,
            regra: 'confirmacao_d1', chave: `confirmacao_d1:visita:${v.id}`,
            titulo: `Confirmar com ${lead?.nome ?? 'o cliente'}: agendamento amanhã (${quando})`,
          })
        }

        // Automações "parado_x_horas" (Fase 4.3) — acopladas à régua (sem cron novo).
        // Idempotente por (automação, lead, instante de entrada na etapa).
        let disparosAuto = 0
        const { data: autos } = await supabase
          .from('automacoes')
          .select('id, empresa_id, etapa_slug, horas, acao, config')
          .eq('gatilho', 'parado_x_horas').eq('ativo', true)
        for (const a of (autos ?? []) as Array<{ id: number; empresa_id: number; etapa_slug: string | null; horas: number | null; acao: string; config: Record<string, unknown> | null }>) {
          if (desativadas.has(a.empresa_id)) continue
          const horas = a.horas ?? 48
          const corte = new Date(now.getTime() - horas * 3600 * 1000).toISOString()
          let q = supabase.from('leads')
            .select('id, nome, responsavel_id, data_transferencia_funil')
            .eq('empresa_id', a.empresa_id).eq('ativo', true)
            .lt('data_transferencia_funil', corte)
          if (a.etapa_slug) q = q.eq('kanban_status', a.etapa_slug)
          const { data: parados } = await q.limit(500)
          for (const l of (parados ?? []) as Array<{ id: number; nome: string | null; responsavel_id: string | null; data_transferencia_funil: string | null }>) {
            const chave = `auto:${a.id}:lead:${l.id}:${l.data_transferencia_funil ?? 'x'}`
            const { data: marca } = await supabase
              .from('followups_gerados')
              .upsert({ empresa_id: a.empresa_id, lead_id: l.id, regra: `automacao:${a.id}`, chave }, { onConflict: 'chave', ignoreDuplicates: true })
              .select('id').maybeSingle()
            if (!marca) continue // já disparou para este instante de entrada
            try {
              await executarAcao(supabase as unknown as SupabaseClient, a.empresa_id, { id: l.id, nome: l.nome, responsavel_id: l.responsavel_id }, a.acao, a.config ?? {})
              disparosAuto++
            } catch (e) {
              await supabase.from('followups_gerados').delete().eq('id', marca.id)
              console.error('[cron/automacoes] falha', a.id, e)
            }
          }
        }

        return NextResponse.json({ ok: true, job, criadas, automacoes: disparosAuto })
      }

      case 'sync-fipe': {
        // Revalida o mês de referência da FIPE (barato: 1 request). Os valores em si
        // são cacheados sob demanda em fipe_consultas ao serem consultados.
        const { codigo, mes } = await atualizarReferencia(supabase)
        return NextResponse.json({ ok: true, job, codigo, mes })
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
