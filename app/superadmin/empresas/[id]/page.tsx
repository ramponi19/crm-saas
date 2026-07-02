import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AcoesEmpresa } from '@/components/superadmin/acoes-empresa'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users, Target, ShoppingBag, Building2 } from 'lucide-react'

const ADMIN_COR = '#7C3AED'

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ativo:     { label: 'Ativo',     bg: '#16A34A15', text: '#15803D' },
  suspenso:  { label: 'Suspenso',  bg: '#DC262615', text: '#B91C1C' },
  cancelado: { label: 'Cancelado', bg: '#6B728015', text: '#4B5563' },
}

const PLANO_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  free:    { label: 'Free',    bg: '#6B728015', text: '#4B5563' },
  starter: { label: 'Starter', bg: '#2563EB15', text: '#1D4ED8' },
  pro:     { label: 'Pro',     bg: '#7C3AED15', text: '#6D28D9' },
}

function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EmpresaDetalhePage({ params }: PageProps) {
  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) notFound()

  await createClient() // mantém a sessão do superadmin válida
  // Service role: o superadmin precisa enxergar dados de QUALQUER empresa, e as
  // policies de RLS (empresa_usuarios, leads, vendas, clientes) escopam por
  // empresa do usuário logado. O acesso à rota já é trancado em layout.tsx
  // (requireSuperAdmin), então ler via service role aqui é seguro.
  const svc = createServiceClient()

  const { data: empresa } = await svc
    .from('empresas')
    .select('*')
    .eq('id', empresaId)
    .single()

  if (!empresa) notFound()

  // Usuários membros
  const { data: membrosRaw } = await svc
    .from('empresa_usuarios')
    .select('role, ativo, usuario:usuarios(nome, email)')
    .eq('empresa_id', empresaId)

  const membros = (membrosRaw ?? []) as unknown as Array<{
    role: string
    ativo: boolean
    usuario: { nome: string; email: string | null } | null
  }>

  // Contadores de uso
  const [{ count: leadsCount }, { count: vendasCount }, { count: clientesCount }] = await Promise.all([
    svc.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    svc.from('vendas').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    svc.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
  ])

  const usuariosAtivos = membros.filter(m => m.ativo).length
  const sb = STATUS_BADGE[empresa.status] ?? STATUS_BADGE.cancelado
  const pb = PLANO_BADGE[empresa.plano] ?? PLANO_BADGE.free

  const limiteUsuarios = empresa.limite_usuarios ?? 0
  const limiteLeads = empresa.limite_leads ?? 0

  const usoUsuarios = limiteUsuarios > 0 ? Math.min(100, (usuariosAtivos / limiteUsuarios) * 100) : 0
  const usoLeads = limiteLeads > 0 ? Math.min(100, ((leadsCount ?? 0) / limiteLeads) * 100) : 0

  const contadores = [
    { label: 'Leads', valor: leadsCount ?? 0, icon: Target, cor: '#2563EB' },
    { label: 'Vendas', valor: vendasCount ?? 0, icon: ShoppingBag, cor: '#16A34A' },
    { label: 'Clientes', valor: clientesCount ?? 0, icon: Users, cor: '#D97706' },
  ]

  return (
    <div className="px-8 py-7 max-w-[1100px]">
      {/* Voltar */}
      <Link
        href="/superadmin/empresas"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#788698] hover:text-[#16212E] transition-colors mb-5"
      >
        <ArrowLeft size={16} />
        Voltar para empresas
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div
            className="w-[56px] h-[56px] rounded-[15px] flex items-center justify-center shrink-0"
            style={{ background: `${(empresa.wl_cor ?? ADMIN_COR)}18` }}
          >
            <Building2 size={26} style={{ color: empresa.wl_cor ?? ADMIN_COR }} />
          </div>
          <div>
            <h1 className="font-sans font-extrabold text-[24px] text-[#16212E] tracking-tight">{empresa.nome}</h1>
            <p className="text-[13px] text-[#9AA7B6] font-mono">{empresa.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: pb.bg, color: pb.text }}>{pb.label}</span>
          <span className="inline-flex px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: sb.bg, color: sb.text }}>{sb.label}</span>
        </div>
      </div>

      {/* Contadores de uso */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {contadores.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={17} style={{ color: c.cor }} />
                <span className="text-[13px] font-semibold text-[#788698]">{c.label}</span>
              </div>
              <div className="font-sans font-extrabold text-[26px] text-[#16212E]">{c.valor}</div>
            </div>
          )
        })}
      </div>

      {/* Limites de uso */}
      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5 mb-5">
        <h3 className="font-sans font-bold text-[15px] text-[#16212E] mb-4">Uso vs. limites do plano</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-[13px] mb-1.5">
              <span className="text-[#56657A] font-semibold">Usuários</span>
              <span className="text-[#788698]">{usuariosAtivos} / {limiteUsuarios}</span>
            </div>
            <div className="h-2 bg-[#16212E]/[0.06] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${usoUsuarios}%`, background: usoUsuarios > 90 ? '#DC2626' : ADMIN_COR }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[13px] mb-1.5">
              <span className="text-[#56657A] font-semibold">Leads</span>
              <span className="text-[#788698]">{leadsCount ?? 0} / {limiteLeads}</span>
            </div>
            <div className="h-2 bg-[#16212E]/[0.06] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${usoLeads}%`, background: usoLeads > 90 ? '#DC2626' : ADMIN_COR }} />
            </div>
          </div>
        </div>
      </div>

      {/* Ações administrativas (client) */}
      <div className="mb-5">
        <AcoesEmpresa
          empresaId={empresaId}
          empresaNome={empresa.nome}
          planoAtual={empresa.plano}
          statusAtual={empresa.status}
          segmentoAtual={empresa.segmento}
        />
      </div>

      {/* Grid: dados + membros */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Dados da assinatura */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
          <h3 className="font-sans font-bold text-[15px] text-[#16212E] mb-4">Assinatura & Stripe</h3>
          <dl className="space-y-3 text-[13.5px]">
            <div className="flex justify-between">
              <dt className="text-[#9AA7B6]">Criada em</dt>
              <dd className="text-[#16212E] font-semibold">{fmtData(empresa.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#9AA7B6]">Trial termina</dt>
              <dd className="text-[#16212E] font-semibold">{fmtData(empresa.trial_ends_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#9AA7B6]">Stripe status</dt>
              <dd className="text-[#16212E] font-semibold">{empresa.stripe_status ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#9AA7B6]">Customer ID</dt>
              <dd className="text-[#16212E] font-mono text-[12px] truncate max-w-[180px]">{empresa.stripe_customer_id ?? '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Membros */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
          <h3 className="font-sans font-bold text-[15px] text-[#16212E] mb-4">
            Usuários ({membros.length})
          </h3>
          <div className="space-y-2.5">
            {membros.length === 0 && (
              <p className="text-[13px] text-[#9AA7B6]">Nenhum usuário vinculado.</p>
            )}
            {membros.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-[34px] h-[34px] rounded-[10px] bg-[#16212E]/[0.05] flex items-center justify-center text-[12px] font-bold text-[#56657A] shrink-0">
                  {(m.usuario?.nome ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-[#16212E] truncate">{m.usuario?.nome ?? '—'}</div>
                  <div className="text-[12px] text-[#9AA7B6] truncate">{m.usuario?.email ?? '—'}</div>
                </div>
                <span className="text-[11.5px] font-semibold capitalize px-2 py-0.5 rounded-full bg-[#16212E]/[0.05] text-[#56657A]">
                  {m.role}
                </span>
                {!m.ativo && <span className="text-[11px] text-[#DC2626]">inativo</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
