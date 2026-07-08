import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Search, ChevronRight, Building2 } from 'lucide-react'
import { Card, Badge, Table, EmptyState, type Column } from '@/components/ui'

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
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; plano?: string }>
}

type Empresa = {
  id: number
  nome: string
  slug: string
  plano: string
  status: string
  stripe_status: string | null
  trial_ends_at: string | null
  created_at: string | null
  limite_usuarios: number | null
  limite_leads: number | null
}

export default async function EmpresasPage({ searchParams }: PageProps) {
  const { q, status, plano } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('empresas')
    .select('id, nome, slug, plano, status, stripe_status, trial_ends_at, created_at, limite_usuarios, limite_leads')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (plano) query = query.eq('plano', plano)
  if (q) query = query.ilike('nome', `%${q}%`)

  const { data: empresas } = await query
  const lista = (empresas ?? []) as Empresa[]

  function filtroLink(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = { q, status, plano, ...params }
    Object.entries(merged).forEach(([k, v]) => { if (v) sp.set(k, v) })
    const qs = sp.toString()
    return qs ? `/superadmin/empresas?${qs}` : '/superadmin/empresas'
  }

  const statusFiltros = [
    { value: undefined, label: 'Todos' },
    { value: 'ativo', label: 'Ativos' },
    { value: 'suspenso', label: 'Suspensos' },
    { value: 'cancelado', label: 'Cancelados' },
  ]

  const cols: Column<Empresa>[] = [
    {
      key: 'empresa', header: 'Empresa',
      render: (emp) => (
        <Link href={`/superadmin/empresas/${emp.id}`} className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
            {getInitials(emp.nome)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{emp.nome}</div>
            <div className="num truncate text-[11px] text-ink-3">{emp.slug}</div>
          </div>
        </Link>
      ),
    },
    { key: 'plano', header: 'Plano', render: (emp) => planoBadge(emp.plano) },
    { key: 'status', header: 'Status', render: (emp) => statusBadge(emp.status) },
    { key: 'stripe', header: 'Stripe', hideOnMobile: true, render: (emp) => <span className="text-ink-2">{emp.stripe_status ?? '—'}</span> },
    { key: 'criada', header: 'Criada em', hideOnMobile: true, render: (emp) => <span className="num text-ink-2">{fmtData(emp.created_at)}</span> },
    {
      key: 'acao', header: '', align: 'right',
      render: (emp) => (
        <Link href={`/superadmin/empresas/${emp.id}`} className="inline-flex text-ink-3 transition-colors hover:text-[#6D28D9]">
          <ChevronRight size={18} strokeWidth={1.7} />
        </Link>
      ),
    },
  ]

  return (
    <div className="max-w-[1400px] px-8 py-7">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.03em] text-ink">Empresas</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          {lista.length} {lista.length === 1 ? 'empresa encontrada' : 'empresas encontradas'}
        </p>
      </div>

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form className="relative min-w-[240px] max-w-[360px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <Search size={15} strokeWidth={1.7} />
          </span>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Buscar por nome…"
            className="h-9 w-full rounded-control border border-line bg-card pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-3 transition-colors focus:border-[#6D28D9] focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30"
          />
          {status && <input type="hidden" name="status" value={status} />}
          {plano && <input type="hidden" name="plano" value={plano} />}
        </form>

        <div className="flex w-max items-center gap-1 rounded-control border border-line bg-card p-1">
          {statusFiltros.map(f => {
            const ativo = status === f.value || (!status && !f.value)
            return (
              <Link
                key={f.label}
                href={filtroLink({ status: f.value })}
                className={`whitespace-nowrap rounded-[6px] px-4 py-1.5 text-[13px] font-semibold transition-colors ${ativo ? 'text-white' : 'text-ink-2 hover:bg-ink/[0.04]'}`}
                style={ativo ? { background: PLATFORM } : undefined}
              >
                {f.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Tabela */}
      <Card flush>
        <Table
          columns={cols}
          rows={lista}
          rowKey={(emp) => emp.id}
          empty={<EmptyState icon={<Building2 size={22} strokeWidth={1.7} />} title="Nenhuma empresa encontrada" description="Nenhuma empresa corresponde aos filtros atuais." />}
        />
      </Card>
    </div>
  )
}
