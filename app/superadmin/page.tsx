import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react'
import { SyncStripeButton } from '@/components/superadmin/sync-stripe-button'

const ADMIN_COR = '#7C3AED'

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

  const cards = [
    { label: 'Total de empresas', valor: String(total), icon: Building2, cor: '#7C3AED' },
    { label: 'Ativas', valor: String(ativas), icon: CheckCircle2, cor: '#16A34A' },
    { label: 'Em trial', valor: String(emTrial), icon: Clock, cor: '#D97706' },
    { label: 'Inadimplentes', valor: String(inadimplentes), icon: AlertTriangle, cor: '#DC2626' },
  ]

  return (
    <div className="px-8 py-7 max-w-[1400px]">
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center justify-between">
          <h1 className="font-serif font-medium text-[26px] text-[#16212E] tracking-[-0.02em]">
            Visão geral
          </h1>
          <SyncStripeButton />
        </div>
        <p className="text-[14px] text-[#788698] mt-1">
          Métricas consolidadas de todos os tenants do CRM
        </p>
      </div>

      {/* Cards de status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
              <div className="flex items-center justify-between mb-3">
                <span
                  className="w-[40px] h-[40px] rounded-[11px] flex items-center justify-center"
                  style={{ background: `${card.cor}15` }}
                >
                  <Icon size={20} style={{ color: card.cor }} />
                </span>
              </div>
              <div className="font-sans font-extrabold text-[28px] text-[#16212E] leading-none">
                {card.valor}
              </div>
              <div className="text-[13px] text-[#788698] mt-1.5">{card.label}</div>
            </div>
          )
        })}
      </div>

      {/* MRR + Novos cadastros */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} style={{ color: ADMIN_COR }} />
            <span className="text-[13px] font-semibold text-[#788698]">MRR estimado</span>
          </div>
          <div className="font-sans font-extrabold text-[36px] text-[#16212E] leading-tight">
            {fmtBRL(mrr)}
          </div>
          <p className="text-[12px] text-[#9AA7B6] mt-1">
            Receita recorrente mensal das empresas ativas pagantes
          </p>

          {/* Distribuição por plano */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-[#16212E]/[0.06]">
            <div>
              <div className="text-[11px] text-[#9AA7B6] uppercase tracking-wide font-mono">Free</div>
              <div className="font-sans font-bold text-[20px] text-[#16212E] mt-0.5">{porPlano.free}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#9AA7B6] uppercase tracking-wide font-mono">Starter</div>
              <div className="font-sans font-bold text-[20px] text-[#16212E] mt-0.5">{porPlano.starter}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#9AA7B6] uppercase tracking-wide font-mono">Pro</div>
              <div className="font-sans font-bold text-[20px] text-[#16212E] mt-0.5">{porPlano.pro}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight size={18} style={{ color: '#16A34A' }} />
            <span className="text-[13px] font-semibold text-[#788698]">Novos (30 dias)</span>
          </div>
          <div className="font-sans font-extrabold text-[36px] text-[#16212E] leading-tight">
            {novos30d}
          </div>
          <p className="text-[12px] text-[#9AA7B6] mt-1">
            Empresas cadastradas no último mês
          </p>
          <Link
            href="/superadmin/empresas"
            className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold transition-colors hover:opacity-80"
            style={{ color: ADMIN_COR }}
          >
            Ver todas as empresas
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  )
}
