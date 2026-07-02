import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Search, ChevronRight } from 'lucide-react'

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
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; plano?: string }>
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
  const lista = empresas ?? []

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

  return (
    <div className="px-8 py-7 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif font-medium text-[26px] text-[#16212E] tracking-[-0.02em]">
          Empresas
        </h1>
        <p className="text-[14px] text-[#788698] mt-1">
          {lista.length} {lista.length === 1 ? 'empresa encontrada' : 'empresas encontradas'}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <form className="relative flex-1 min-w-[240px] max-w-[360px]">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9AA7B6]" />
          <input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Buscar por nome..."
            className="w-full pl-10 pr-4 py-[10px] text-[13.5px] bg-white border border-[#16212E]/[0.08] rounded-[11px] outline-none focus:border-[#7C3AED]/40 transition-colors text-[#16212E] placeholder:text-[#9AA7B6]"
          />
          {status && <input type="hidden" name="status" value={status} />}
          {plano && <input type="hidden" name="plano" value={plano} />}
        </form>

        <div className="flex items-center gap-[4px] bg-white border border-[#16212E]/[0.08] rounded-[13px] p-[5px] w-max">
          {statusFiltros.map(f => {
            const ativo = status === f.value || (!status && !f.value)
            return (
              <Link
                key={f.label}
                href={filtroLink({ status: f.value })}
                className="flex items-center gap-2 px-[16px] py-[9px] rounded-[9px] text-[13px] font-semibold transition-all whitespace-nowrap"
                style={ativo
                  ? { background: `linear-gradient(to bottom, ${ADMIN_COR}, #6D28D9)`, color: '#fff', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }
                  : { color: '#788698' }}
              >
                {f.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#16212E]/[0.07]">
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-5 py-3.5">Empresa</th>
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-3 py-3.5">Plano</th>
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-3 py-3.5">Status</th>
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-3 py-3.5">Stripe</th>
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-3 py-3.5">Criada em</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[14px] text-[#9AA7B6]">
                  Nenhuma empresa encontrada com os filtros atuais.
                </td>
              </tr>
            )}
            {lista.map(emp => {
              const sb = STATUS_BADGE[emp.status] ?? STATUS_BADGE.cancelado
              const pb = PLANO_BADGE[emp.plano] ?? PLANO_BADGE.free
              return (
                <tr
                  key={emp.id}
                  className="border-b border-[#16212E]/[0.05] last:border-0 hover:bg-[#16212E]/[0.015] transition-colors"
                >
                  <td className="px-5 py-4">
                    <Link href={`/superadmin/empresas/${emp.id}`} className="block">
                      <div className="font-semibold text-[14px] text-[#16212E]">{emp.nome}</div>
                      <div className="text-[12px] text-[#9AA7B6] font-mono">{emp.slug}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-4">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-[11.5px] font-semibold" style={{ background: pb.bg, color: pb.text }}>
                      {pb.label}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-[11.5px] font-semibold" style={{ background: sb.bg, color: sb.text }}>
                      {sb.label}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-[13px] text-[#56657A]">
                    {emp.stripe_status ?? '—'}
                  </td>
                  <td className="px-3 py-4 text-[13px] text-[#56657A]">
                    {fmtData(emp.created_at)}
                  </td>
                  <td className="px-3 py-4">
                    <Link href={`/superadmin/empresas/${emp.id}`} className="text-[#9AA7B6] hover:text-[#7C3AED] transition-colors">
                      <ChevronRight size={18} />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
