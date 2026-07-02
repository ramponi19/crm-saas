import Link from 'next/link'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
import { ReguaFollowupCard } from '@/components/admin/regua-followup-card'
import { Topbar } from '@/components/layout/topbar'
import {
  Users, Target, Package, Wallet, UserCog, Settings, Building2,
  ArrowUpRight, CreditCard, TrendingUp,
} from 'lucide-react'

export const metadata = { title: 'Administração' }

const GOLD = '#C9A24B'
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
  const isImob = normalizarSegmento(empresa?.segmento) === 'imobiliaria'

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
    <div className="flex flex-col h-full">
      <Topbar title="Visão geral" />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="px-8 py-8 max-w-[1100px]">
      <p className="text-[14px] text-[#788698] mb-6">A saúde da sua operação num só lugar.</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
              <div className="w-[40px] h-[40px] rounded-[11px] flex items-center justify-center mb-4" style={{ background: `${GOLD}18`, color: GOLD }}>
                <Icon size={20} />
              </div>
              <div className="text-[26px] font-extrabold text-[#16212E] leading-none">{s.value}</div>
              <div className="text-[12.5px] text-[#788698] mt-2">{s.label}</div>
              <div className="text-[11px] text-[#9AA7B6] mt-0.5">{s.sub}</div>
            </div>
          )
        })}
      </div>

      {/* Plano + uso */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[12.5px] text-[#788698]">Plano atual</div>
              <div className="text-[20px] font-extrabold text-[#16212E] capitalize">{planoCfg?.nome ?? empresa?.plano ?? '—'}</div>
            </div>
            <Link href="/admin/planos" className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-[10px] text-white" style={{ background: `linear-gradient(135deg, ${GOLD}, #A8884A)` }}>
              Fazer upgrade <ArrowUpRight size={15} />
            </Link>
          </div>
          {trialDias !== null && trialDias > 0 && (
            <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: `${GOLD}12`, color: '#8A6D2B' }}>
              Período de teste: <b>{trialDias} dia{trialDias === 1 ? '' : 's'}</b> restante{trialDias === 1 ? '' : 's'}.
            </div>
          )}
        </div>

        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6 space-y-4">
          <div className="text-[12.5px] text-[#788698] font-semibold">Uso do plano</div>
          {[
            { label: 'Leads ativos', used: leadsAtivos, limit: limiteLeads, pct: pctLeads },
            { label: 'Usuários', used: usuarios, limit: limiteUsuarios, pct: pctUsuarios },
          ].map((u) => (
            <div key={u.label}>
              <div className="flex justify-between text-[12.5px] mb-1.5">
                <span className="text-[#56657A]">{u.label}</span>
                <span className="font-semibold text-[#16212E]">{u.used}{u.limit ? ` / ${u.limit}` : ''}</span>
              </div>
              <div className="h-2 bg-[#16212E]/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${u.pct}%`, background: u.pct > 90 ? '#DC2626' : GOLD }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Automação */}
      <div className="mb-6">
        <div className="font-mono text-[10px] tracking-[0.2em] text-[#9AA7B6] uppercase mb-2">Automação</div>
        <ReguaFollowupCard inicialAtivo={reguaAtiva} isImob={isImob} />
      </div>

      {/* Atalhos de administração */}
      <div className="grid sm:grid-cols-2 gap-4">
        {atalhos.map((a) => {
          const Icon = a.icon
          return (
            <Link key={a.href} href={a.href} className="group bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5 flex items-center gap-4 hover:border-[rgba(201,162,75,.55)] hover:shadow-[0_10px_30px_rgba(22,35,50,.08)] transition-all">
              <div className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center shrink-0" style={{ background: `${GOLD}18`, color: GOLD }}>
                <Icon size={21} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-[#16212E]">{a.label}</div>
                <div className="text-[12.5px] text-[#788698]">{a.desc}</div>
              </div>
              <ArrowUpRight size={18} className="text-[#B0BCC9] group-hover:text-[#C9A24B] transition-colors" />
            </Link>
          )
        })}
      </div>
      </div>
      </div>
    </div>
  )
}
