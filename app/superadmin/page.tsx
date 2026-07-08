import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, ArrowUpRight } from 'lucide-react'
import { SyncStripeButton } from '@/components/superadmin/sync-stripe-button'
import { StatCard } from '@/components/ui'

const ROXO = '#6D28D9'

// Preço mensal por plano (centavos → exibido em reais). Ajustar quando os preços Stripe forem definidos.
const PRECO_PLANO: Record<string, number> = {
  free: 0,
  starter: 97,
  pro: 197,
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function SuperAdminDashboard() {
  const supabase = await createClient()

  const { data: empresas } = await supabase
    .from('empresas')
    .select('id, nome, plano, status, stripe_status, trial_ends_at, created_at')

  const lista = empresas ?? []
  const total = lista.length

  const ativas = lista.filter(e => e.status === 'ativo').length
  const emTrial = lista.filter(
    e => e.stripe_status === 'trialing' ||
         (e.trial_ends_at && new Date(e.trial_ends_at) > new Date())
  ).length
  const inadimplentes = lista.filter(
    e => e.stripe_status === 'past_due' || e.status === 'suspenso'
  ).length

  // MRR estimado: soma do preço do plano das empresas pagantes (status ativo, não-free)
  const mrr = lista
    .filter(e => e.status === 'ativo' && e.plano !== 'free')
    .reduce((acc, e) => acc + (PRECO_PLANO[e.plano] ?? 0), 0)

  // Novos cadastros nos últimos 30 dias
  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
  const novos30d = lista.filter(
    e => e.created_at && new Date(e.created_at) >= trintaDiasAtras
  ).length

  // Distribuição por plano
  const porPlano = {
    free: lista.filter(e => e.plano === 'free').length,
    starter: lista.filter(e => e.plano === 'starter').length,
    pro: lista.filter(e => e.plano === 'pro').length,
  }

  return (
    <div className="min-h-full bg-bg px-8 py-7">
      <div className="mx-auto max-w-[1400px] space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Visão geral</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">Métricas consolidadas de todos os tenants do CRM</p>
          </div>
          <SyncStripeButton />
        </div>

        {/* Cards de status */}
        <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
          <StatCard bare label="Total de empresas" value={total} />
          <StatCard bare label="Ativas" value={ativas} delta="empresas ativas" deltaTone="ok" />
          <StatCard bare label="Em trial" value={emTrial} delta="em período de teste" deltaTone="warn" />
          <StatCard bare label="Inadimplentes" value={inadimplentes} delta="pagamento pendente" deltaTone="bad" />
        </div>

        {/* MRR + Novos cadastros */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-card border border-line bg-card p-6 lg:col-span-2">
            <div className="mb-1 flex items-center gap-2">
              <TrendingUp size={18} strokeWidth={1.7} style={{ color: ROXO }} />
              <span className="text-[13px] font-semibold text-ink-2">MRR estimado</span>
            </div>
            <div className="num text-[36px] font-bold leading-tight tracking-[-0.035em]" style={{ color: ROXO }}>
              {fmtBRL(mrr)}
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              Receita recorrente mensal das empresas ativas pagantes
            </p>

            {/* Distribuição por plano */}
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line-soft pt-5">
              <div>
                <div className="text-[11px] font-medium text-ink-3">Free</div>
                <div className="num mt-0.5 text-[20px] font-bold text-ink">{porPlano.free}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-ink-3">Starter</div>
                <div className="num mt-0.5 text-[20px] font-bold text-ink">{porPlano.starter}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-ink-3">Pro</div>
                <div className="num mt-0.5 text-[20px] font-bold text-ink">{porPlano.pro}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-card border border-line bg-card p-6">
            <div className="mb-1 flex items-center gap-2">
              <ArrowUpRight size={18} strokeWidth={1.7} className="text-ok" />
              <span className="text-[13px] font-semibold text-ink-2">Novos (30 dias)</span>
            </div>
            <div className="num text-[36px] font-bold leading-tight tracking-[-0.035em] text-ink">
              {novos30d}
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              Empresas cadastradas no último mês
            </p>
            <Link
              href="/superadmin/empresas"
              className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: ROXO }}
            >
              Ver todas as empresas
              <ArrowUpRight size={15} strokeWidth={1.7} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
