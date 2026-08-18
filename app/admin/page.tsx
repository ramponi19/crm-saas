import Link from 'next/link'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { ReguaFollowupCard } from '@/components/admin/regua-followup-card'
import { Topbar } from '@/components/layout/topbar'
import { Card, StatCard } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  Users, Target, Package, Wallet, UserCog, Settings, Building2,
  ArrowUpRight, CreditCard, TrendingUp,
} from 'lucide-react'

export const metadata = { title: 'Administração' }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function AdminOverviewPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const mes = new Date().toISOString().slice(0, 7)
  const inicioMes = `${mes}-01`
  const fimMes = new Date(new Date(inicioMes).getFullYear(), new Date(inicioMes).getMonth() + 1, 1).toISOString()

  const [
    empresaRes, clientesRes, leadsRes, produtosRes, usuariosRes, vendasRes, planoRes,
  ] = await Promise.all([
    supabase.from('empresas').select('nome, plano, status, trial_ends_at, limite_leads, limite_usuarios, segmento').eq('id', empresaId).single(),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabase.from('empresa_usuarios').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('vendas').select('valor_venda').eq('empresa_id', empresaId).eq('status', 'concluida').gte('data_venda', inicioMes).lt('data_venda', fimMes),
    supabase.from('empresas').select('plano').eq('id', empresaId).single(),
  ])

  const empresa = empresaRes.data
  const clientes = clientesRes.count ?? 0
  const leadsAtivos = leadsRes.count ?? 0
  const produtos = produtosRes.count ?? 0
  const usuarios = usuariosRes.count ?? 0
  const vendasMes = (vendasRes.data ?? []) as { valor_venda: number | null }[]
  const faturamentoMes = vendasMes.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0)
  const qtdVendas = vendasMes.length

  // plano config (nome/preço/limites reais)
  const { data: planoCfg } = await supabase
    .from('planos_config')
    .select('nome, preco_centavos, limite_leads, limite_usuarios')
    .eq('id', planoRes.data?.plano ?? '')
    .maybeSingle()

  const limiteLeads = empresa?.limite_leads ?? planoCfg?.limite_leads ?? 0
  const limiteUsuarios = empresa?.limite_usuarios ?? planoCfg?.limite_usuarios ?? 0
  const pctLeads = limiteLeads > 0 ? Math.min(100, Math.round((leadsAtivos / limiteLeads) * 100)) : 0
  const pctUsuarios = limiteUsuarios > 0 ? Math.min(100, Math.round((usuarios / limiteUsuarios) * 100)) : 0

  const trialDias = empresa?.trial_ends_at
    ? Math.ceil((new Date(empresa.trial_ends_at).getTime() - Date.now()) / 86400000)
    : null

  // Régua de follow-up: default ligada (ausência de config = ativa). Só desliga com {ativo:false}.
  const { data: reguaCfg } = await supabase
    .from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'regua_followup').maybeSingle()
  const reguaAtiva = (reguaCfg?.valor as { ativo?: boolean } | null)?.ativo !== false
  // O que muda aqui são os atalhos de portais/site — capacidade, não identidade.
  const isImob = !!SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades.integraPortais

  const stats = [
    { label: 'Faturamento no mês', value: brl(faturamentoMes), icon: TrendingUp, sub: `${qtdVendas} venda${qtdVendas === 1 ? '' : 's'} concluída${qtdVendas === 1 ? '' : 's'}` },
    { label: 'Clientes', value: String(clientes), icon: Users, sub: 'cadastrados' },
    { label: 'Leads ativos', value: String(leadsAtivos), icon: Target, sub: 'em atendimento' },
    { label: 'Produtos', value: String(produtos), icon: Package, sub: 'no catálogo' },
  ]

  const atalhos = [
    { href: '/admin/empresa', label: 'Minha empresa', desc: 'Identidade, marca e white-label', icon: Building2 },
    { href: '/admin/configuracoes', label: 'Configurações', desc: 'Integrações, pagamentos e taxas', icon: Settings },
    { href: '/admin/equipe', label: 'Equipe', desc: 'Usuários, metas e comissões', icon: UserCog },
    { href: '/admin/planos', label: 'Planos', desc: 'Assinatura e upgrade', icon: CreditCard },
  ]

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Visão geral" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1100px] space-y-6">
          <p className="text-[14px] text-ink-2">A saúde da sua operação num só lugar.</p>

          {/* KPIs */}
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card lg:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            {stats.map((s) => (
              <StatCard bare key={s.label} label={s.label} value={s.value} delta={s.sub} deltaTone="neutral" />
            ))}
          </div>

          {/* Plano + uso */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="Plano atual"
              actions={
                <Link
                  href="/admin/planos"
                  className="inline-flex h-9 items-center gap-1.5 rounded-control bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink/90"
                >
                  Fazer upgrade <ArrowUpRight size={15} strokeWidth={1.7} />
                </Link>
              }
            >
              <div className="text-[22px] font-bold capitalize tracking-[-0.03em] text-ink">{planoCfg?.nome ?? empresa?.plano ?? '—'}</div>
              {trialDias !== null && trialDias > 0 && (
                <div className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-[12.5px] text-accent">
                  Período de teste: <b className="num">{trialDias} dia{trialDias === 1 ? '' : 's'}</b> restante{trialDias === 1 ? '' : 's'}.
                </div>
              )}
            </Card>

            <Card title="Uso do plano">
              <div className="space-y-4">
                {[
                  { label: 'Leads ativos', used: leadsAtivos, limit: limiteLeads, pct: pctLeads },
                  { label: 'Usuários', used: usuarios, limit: limiteUsuarios, pct: pctUsuarios },
                ].map((u) => (
                  <div key={u.label}>
                    <div className="mb-1.5 flex justify-between text-[12.5px]">
                      <span className="text-ink-2">{u.label}</span>
                      <span className="num font-semibold text-ink">{u.used}{u.limit ? ` / ${u.limit}` : ''}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                      <div className={cn('h-full rounded-full', u.pct > 90 ? 'bg-bad' : 'bg-accent')} style={{ width: `${u.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Automação */}
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">Automação</div>
            <ReguaFollowupCard inicialAtivo={reguaAtiva} isImob={isImob} />
          </div>

          {/* Atalhos de administração */}
          <div className="grid gap-4 sm:grid-cols-2">
            {atalhos.map((a) => {
              const Icon = a.icon
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group flex items-center gap-4 rounded-card border border-line bg-card p-5 transition-colors hover:border-ink/20"
                >
                  <div className="grid h-11 w-11 flex-none place-items-center rounded-control bg-accent-soft text-accent">
                    <Icon size={21} strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-ink">{a.label}</div>
                    <div className="text-[12.5px] text-ink-2">{a.desc}</div>
                  </div>
                  <ArrowUpRight size={18} strokeWidth={1.7} className="text-ink-3 transition-colors group-hover:text-accent" />
                </Link>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
