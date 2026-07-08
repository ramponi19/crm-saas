import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AcoesEmpresa } from '@/components/superadmin/acoes-empresa'
import { ControleEmpresa } from '@/components/superadmin/controle-empresa'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users, Target, ShoppingBag } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { resolverMenu } from '@/lib/menu'
import { normalizarSegmento } from '@/lib/segmentos'

// Roxo da plataforma (superadmin) — único toque de accent permitido aqui.
const PLATFORM = '#6D28D9'

const STATUS_TONE: Record<string, 'ok' | 'bad' | 'neutro'> = {
  ativo: 'ok', suspenso: 'bad', cancelado: 'neutro',
}
const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo', suspenso: 'Suspenso', cancelado: 'Cancelado',
}
const PLANO_LABEL: Record<string, string> = {
  free: 'Free', starter: 'Starter', pro: 'Pro',
}

function planoBadge(plano: string) {
  const label = PLANO_LABEL[plano] ?? 'Free'
  if (plano === 'pro') return <Badge className="bg-[#6D28D9]/10 text-[#6D28D9]">{label}</Badge>
  return <Badge tone="neutro">{label}</Badge>
}

function statusBadge(status: string) {
  const tone = STATUS_TONE[status] ?? 'neutro'
  const label = STATUS_LABEL[status] ?? 'Cancelado'
  return tone === 'ok' ? <Badge tone="ok" dot>{label}</Badge> : <Badge tone={tone}>{label}</Badge>
}

function getInitials(nome: string) {
  const parts = nome.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return nome.slice(0, 2).toUpperCase()
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

  // Contadores de uso + última atividade (último lead recebido)
  const [{ count: leadsCount }, { count: vendasCount }, { count: clientesCount }, { data: ultimoLead }] = await Promise.all([
    svc.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    svc.from('vendas').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    svc.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    svc.from('leads').select('created_at').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // Saúde da assinatura (derivada do stripe_status) e atividade.
  const ss = (empresa.stripe_status ?? '').toLowerCase()
  const saudeAssinatura: { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutro' } =
    ss === 'active' || ss === 'ativo' ? { label: 'Em dia', tone: 'ok' }
    : ss === 'trialing' || ss === 'trial' ? { label: 'Em trial', tone: 'neutro' }
    : ss === 'past_due' || ss === 'unpaid' || ss === 'incomplete' ? { label: 'Inadimplente', tone: 'bad' }
    : ss === 'canceled' || ss === 'cancelado' ? { label: 'Cancelada', tone: 'bad' }
    : { label: empresa.stripe_status ?? 'Sem assinatura', tone: 'neutro' }

  const ultAtividade = ultimoLead?.created_at ? new Date(ultimoLead.created_at) : null
  const diasInativo = ultAtividade ? Math.floor((Date.now() - ultAtividade.getTime()) / 86_400_000) : null

  const usuariosAtivos = membros.filter(m => m.ativo).length

  const limiteUsuarios = empresa.limite_usuarios ?? 0
  const limiteLeads = empresa.limite_leads ?? 0

  const usoUsuarios = limiteUsuarios > 0 ? Math.min(100, (usuariosAtivos / limiteUsuarios) * 100) : 0
  const usoLeads = limiteLeads > 0 ? Math.min(100, ((leadsCount ?? 0) / limiteLeads) * 100) : 0

  const contadores = [
    { label: 'Leads', valor: leadsCount ?? 0, icon: Target },
    { label: 'Vendas', valor: vendasCount ?? 0, icon: ShoppingBag },
    { label: 'Clientes', valor: clientesCount ?? 0, icon: Users },
  ]

  return (
    <div className="max-w-[1100px] px-8 py-7">
      {/* Voltar */}
      <Link
        href="/superadmin/empresas"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft size={16} strokeWidth={1.7} />
        Voltar para empresas
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-ink text-[15px] font-bold text-white">
            {getInitials(empresa.nome)}
          </span>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold tracking-[-0.03em] text-ink">{empresa.nome}</h1>
            <p className="num text-[13px] text-ink-3">{empresa.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {planoBadge(empresa.plano)}
          {statusBadge(empresa.status)}
        </div>
      </div>

      {/* Contadores de uso */}
      <div className="mb-5 grid grid-cols-3 gap-4">
        {contadores.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} className="flex items-center gap-3 rounded-card border border-line bg-card p-5">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-ink/[0.04] text-ink-3">
                <Icon size={17} strokeWidth={1.7} />
              </span>
              <div>
                <div className="num text-[24px] font-bold leading-none text-ink">{c.valor}</div>
                <div className="mt-1 text-[12px] text-ink-3">{c.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Saúde da conta */}
      <Card title="Cobrança & atividade" className="mb-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="mb-1 text-[12px] text-ink-3">Assinatura</div>
            {saudeAssinatura.tone === 'ok'
              ? <Badge tone="ok" dot>{saudeAssinatura.label}</Badge>
              : <Badge tone={saudeAssinatura.tone}>{saudeAssinatura.label}</Badge>}
          </div>
          <div>
            <div className="mb-1 text-[12px] text-ink-3">Última atividade</div>
            <div className="text-[14px] font-semibold text-ink">
              {ultAtividade
                ? (diasInativo === 0 ? 'Hoje' : `há ${diasInativo} dia${diasInativo === 1 ? '' : 's'}`)
                : 'Sem leads ainda'}
            </div>
            {ultAtividade && <div className="text-[11.5px] text-ink-3">{fmtData(ultimoLead!.created_at)}</div>}
          </div>
          <div>
            <div className="mb-1 text-[12px] text-ink-3">Trial termina</div>
            <div className="text-[14px] font-semibold text-ink">{fmtData(empresa.trial_ends_at)}</div>
          </div>
        </div>
      </Card>

      {/* Limites de uso */}
      <Card title="Uso vs. limites do plano" className="mb-5">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="font-semibold text-ink-2">Usuários</span>
              <span className="num text-ink-3">{usuariosAtivos} / {limiteUsuarios}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className={`h-full rounded-full ${usoUsuarios > 90 ? 'bg-bad' : ''}`} style={{ width: `${usoUsuarios}%`, background: usoUsuarios > 90 ? undefined : PLATFORM }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="font-semibold text-ink-2">Leads</span>
              <span className="num text-ink-3">{leadsCount ?? 0} / {limiteLeads}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className={`h-full rounded-full ${usoLeads > 90 ? 'bg-bad' : ''}`} style={{ width: `${usoLeads}%`, background: usoLeads > 90 ? undefined : PLATFORM }} />
            </div>
          </div>
        </div>
      </Card>

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

      {/* Controle de módulos e menu por empresa (camada 3 do resolverMenu) */}
      <div className="mb-5">
        <ControleEmpresa
          empresaId={empresaId}
          modulosInit={(empresa.modulos_override ?? null) as Record<string, boolean> | null}
          menuOverrideInit={(empresa.menu_override ?? null) as { hidden?: string[]; labels?: Record<string, string> } | null}
          items={resolverMenu({ segmento: normalizarSegmento(empresa.segmento), plano: empresa.plano ?? undefined, role: 'owner', isSuperAdmin: true })
            .flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label })))}
          limiteUsuariosInit={empresa.limite_usuarios ?? 0}
          limiteLeadsInit={empresa.limite_leads ?? 0}
        />
      </div>

      {/* Grid: dados + membros */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Dados da assinatura */}
        <Card title="Assinatura & Stripe">
          <dl className="space-y-3 text-[13.5px]">
            <div className="flex justify-between">
              <dt className="text-ink-3">Criada em</dt>
              <dd className="font-semibold text-ink">{fmtData(empresa.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-3">Trial termina</dt>
              <dd className="font-semibold text-ink">{fmtData(empresa.trial_ends_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-3">Stripe status</dt>
              <dd className="font-semibold text-ink">{empresa.stripe_status ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-3">Customer ID</dt>
              <dd className="num max-w-[180px] truncate text-[12px] text-ink">{empresa.stripe_customer_id ?? '—'}</dd>
            </div>
          </dl>
        </Card>

        {/* Membros */}
        <Card title={`Usuários (${membros.length})`}>
          <div className="space-y-2.5">
            {membros.length === 0 && (
              <p className="text-[13px] text-ink-3">Nenhum usuário vinculado.</p>
            )}
            {membros.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
                  {(m.usuario?.nome ?? '?').slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{m.usuario?.nome ?? '—'}</div>
                  <div className="truncate text-[12px] text-ink-3">{m.usuario?.email ?? '—'}</div>
                </div>
                <Badge tone="neutro" className="capitalize">{m.role}</Badge>
                {!m.ativo && <Badge tone="bad">inativo</Badge>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
