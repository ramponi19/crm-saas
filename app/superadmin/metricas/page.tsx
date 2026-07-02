import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, AlertTriangle } from 'lucide-react'

const ADMIN_COR = '#7C3AED'

const PRECO_PLANO: Record<string, number> = { free: 0, starter: 97, pro: 197 }

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesLabel(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export default async function MetricasPage() {
  const supabase = await createClient()

  const { data: empresas } = await supabase
    .from('empresas')
    .select('id, nome, plano, status, created_at, limite_usuarios, limite_leads')

  const lista = empresas ?? []

  // 1) Novos tenants por mês (últimos 6 meses)
  const meses: { label: string; chave: string; total: number }[] = []
  const hoje = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    meses.push({
      label: mesLabel(d),
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      total: 0,
    })
  }
  lista.forEach(e => {
    if (!e.created_at) return
    const d = new Date(e.created_at)
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const m = meses.find(x => x.chave === chave)
    if (m) m.total++
  })
  const maxMes = Math.max(1, ...meses.map(m => m.total))

  // 2) MRR por plano
  const mrrPorPlano = (['starter', 'pro'] as const).map(plano => {
    const empresasPlano = lista.filter(e => e.plano === plano && e.status === 'ativo')
    return {
      plano,
      qtd: empresasPlano.length,
      mrr: empresasPlano.length * PRECO_PLANO[plano],
    }
  })
  const mrrTotal = mrrPorPlano.reduce((acc, p) => acc + p.mrr, 0)

  // 3) Empresas próximas do limite — precisa contar leads/usuários por empresa
  // Buscamos contagens em paralelo (limitado às empresas ativas para reduzir custo)
  const ativas = lista.filter(e => e.status === 'ativo')
  const usos = await Promise.all(
    ativas.map(async e => {
      const [{ count: leads }, { count: usuarios }] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', e.id),
        supabase.from('empresa_usuarios').select('*', { count: 'exact', head: true }).eq('empresa_id', e.id).eq('ativo', true),
      ])
      const limLeads = e.limite_leads ?? 0
      const limUsuarios = e.limite_usuarios ?? 0
      const pctLeads = limLeads > 0 ? ((leads ?? 0) / limLeads) * 100 : 0
      const pctUsuarios = limUsuarios > 0 ? ((usuarios ?? 0) / limUsuarios) * 100 : 0
      return {
        id: e.id,
        nome: e.nome,
        leads: leads ?? 0,
        limLeads,
        usuarios: usuarios ?? 0,
        limUsuarios,
        pctMax: Math.max(pctLeads, pctUsuarios),
      }
    })
  )
  const proximasLimite = usos
    .filter(u => u.pctMax >= 70)
    .sort((a, b) => b.pctMax - a.pctMax)

  return (
    <div className="px-8 py-7 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="font-serif font-medium text-[26px] text-[#16212E] tracking-[-0.02em]">Métricas</h1>
        <p className="text-[14px] text-[#788698] mt-1">Crescimento, receita e capacidade dos tenants</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Novos tenants por mês */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
          <h3 className="font-sans font-bold text-[15px] text-[#16212E] mb-5">Novos tenants por mês</h3>
          <div className="flex items-end justify-between gap-3 h-[160px]">
            {meses.map(m => (
              <div key={m.chave} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center" style={{ height: '130px' }}>
                  <div
                    className="w-full max-w-[44px] rounded-t-[6px] transition-all relative group"
                    style={{
                      height: `${(m.total / maxMes) * 100}%`,
                      minHeight: m.total > 0 ? '6px' : '2px',
                      background: m.total > 0 ? `linear-gradient(to top, ${ADMIN_COR}, #9F67F0)` : '#16212E10',
                    }}
                  >
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[12px] font-bold text-[#16212E]">
                      {m.total > 0 ? m.total : ''}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-[#9AA7B6] font-mono">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MRR por plano */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} style={{ color: ADMIN_COR }} />
            <h3 className="font-sans font-bold text-[15px] text-[#16212E]">MRR por plano</h3>
          </div>
          <div className="font-sans font-extrabold text-[30px] text-[#16212E] mb-5">{fmtBRL(mrrTotal)}</div>
          <div className="space-y-4">
            {mrrPorPlano.map(p => (
              <div key={p.plano}>
                <div className="flex justify-between text-[13px] mb-1.5">
                  <span className="text-[#56657A] font-semibold capitalize">{p.plano} ({p.qtd})</span>
                  <span className="text-[#16212E] font-bold">{fmtBRL(p.mrr)}</span>
                </div>
                <div className="h-2.5 bg-[#16212E]/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${mrrTotal > 0 ? (p.mrr / mrrTotal) * 100 : 0}%`,
                      background: p.plano === 'pro' ? ADMIN_COR : '#2563EB',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Empresas próximas do limite */}
      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} style={{ color: '#D97706' }} />
          <h3 className="font-sans font-bold text-[15px] text-[#16212E]">Empresas próximas do limite</h3>
          <span className="text-[12px] text-[#9AA7B6]">(uso ≥ 70%)</span>
        </div>
        {proximasLimite.length === 0 ? (
          <p className="text-[13px] text-[#9AA7B6] py-4">Nenhuma empresa próxima do limite no momento.</p>
        ) : (
          <div className="space-y-3">
            {proximasLimite.map(u => (
              <Link
                key={u.id}
                href={`/superadmin/empresas/${u.id}`}
                className="flex items-center gap-4 p-3 rounded-[12px] border border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.015] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-[#16212E] truncate">{u.nome}</div>
                  <div className="text-[12px] text-[#9AA7B6]">
                    {u.leads}/{u.limLeads} leads · {u.usuarios}/{u.limUsuarios} usuários
                  </div>
                </div>
                <span
                  className="text-[13px] font-bold px-3 py-1 rounded-full shrink-0"
                  style={{
                    background: u.pctMax >= 90 ? '#DC262615' : '#D9770615',
                    color: u.pctMax >= 90 ? '#B91C1C' : '#B45309',
                  }}
                >
                  {Math.round(u.pctMax)}%
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
