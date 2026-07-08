import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import { Card, StatCard, Badge } from '@/components/ui'

const ROXO = '#6D28D9'

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
    <div className="min-h-full bg-bg px-8 py-7">
      <div className="mx-auto max-w-[1400px] space-y-5">

        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Métricas</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Crescimento, receita e capacidade dos tenants</p>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
          <StatCard bare label="MRR estimado" value={fmtBRL(mrrTotal)} />
          <StatCard bare label="Total de tenants" value={lista.length} />
          <StatCard bare label="Ativos" value={ativas.length} delta="em operação" deltaTone="ok" />
          <StatCard bare label="Inativos" value={lista.length - ativas.length} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Novos tenants por mês */}
          <Card title="Novos tenants por mês">
            <div className="flex h-[160px] items-end justify-between gap-3">
              {meses.map(m => (
                <div key={m.chave} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full items-end justify-center" style={{ height: '130px' }}>
                    <div
                      className="relative w-full max-w-[44px] rounded-t-[6px] transition-all"
                      style={{
                        height: `${(m.total / maxMes) * 100}%`,
                        minHeight: m.total > 0 ? '6px' : '2px',
                        background: m.total > 0 ? ROXO : 'rgba(21,24,28,0.06)',
                      }}
                    >
                      <span className="num absolute -top-5 left-1/2 -translate-x-1/2 text-[12px] font-bold text-ink">
                        {m.total > 0 ? m.total : ''}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-ink-3">{m.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* MRR por plano */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <TrendingUp size={17} strokeWidth={1.7} style={{ color: ROXO }} />
                MRR por plano
              </span>
            }
          >
            <div className="num mb-5 text-[30px] font-bold tracking-[-0.035em] text-ink">{fmtBRL(mrrTotal)}</div>
            <div className="space-y-4">
              {mrrPorPlano.map(p => (
                <div key={p.plano}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="font-semibold capitalize text-ink-2">{p.plano} ({p.qtd})</span>
                    <span className="num font-bold text-ink">{fmtBRL(p.mrr)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${mrrTotal > 0 ? (p.mrr / mrrTotal) * 100 : 0}%`,
                        background: p.plano === 'pro' ? ROXO : 'rgba(21,24,28,0.30)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Empresas próximas do limite */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle size={17} strokeWidth={1.7} className="text-warn" />
              Empresas próximas do limite
            </span>
          }
          actions={<span className="text-[12px] text-ink-3">uso ≥ 70%</span>}
        >
          {proximasLimite.length === 0 ? (
            <p className="py-4 text-[13px] text-ink-3">Nenhuma empresa próxima do limite no momento.</p>
          ) : (
            <div className="space-y-2">
              {proximasLimite.map(u => (
                <Link
                  key={u.id}
                  href={`/superadmin/empresas/${u.id}`}
                  className="flex items-center gap-4 rounded-card border border-line-soft p-3 transition-colors hover:bg-raised"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{u.nome}</div>
                    <div className="num text-[12px] text-ink-3">
                      {u.leads}/{u.limLeads} leads · {u.usuarios}/{u.limUsuarios} usuários
                    </div>
                  </div>
                  <Badge tone={u.pctMax >= 90 ? 'bad' : 'warn'} className="num">
                    {Math.round(u.pctMax)}%
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
