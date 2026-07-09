import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { TrendingUp, AlertTriangle, Layers, Clock } from 'lucide-react'
import { Card, StatCard, Badge } from '@/components/ui'
import { SEGMENTOS_LISTA, normalizarSegmento } from '@/lib/segmentos'

const ROXO = '#6D28D9'

// Fallback caso planos_config não tenha o plano (preços em reais/mês).
const PRECO_FALLBACK: Record<string, number> = { free: 0, starter: 97, pro: 197 }

const SEG_LABEL: Record<string, string> = Object.fromEntries(
  SEGMENTOS_LISTA.map(({ id, config }) => [id, config.label])
)

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesLabel(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

function diasDesde(d: Date, ref: Date) {
  return Math.floor((ref.getTime() - d.getTime()) / 86_400_000)
}

export default async function MetricasPage() {
  // Service role: o superadmin precisa agregar dados de TODAS as empresas. A RLS
  // de empresas/leads escopa por empresa do usuário logado (leads não tem bypass
  // de superadmin), então o client normal zeraria as contagens dos outros tenants.
  // A rota já é trancada em superadmin/layout (requireSuperAdmin).
  const supabase = createServiceClient()

  const [{ data: empresas }, { data: planos }] = await Promise.all([
    supabase
      .from('empresas')
      .select('id, nome, plano, status, segmento, created_at, limite_usuarios, limite_leads')
      .neq('demo', true),
    supabase.from('planos_config').select('id, preco_centavos'),
  ])

  const lista = empresas ?? []
  const hoje = new Date()

  // Preço mensal por plano (planos_config em centavos → reais; fallback no hardcode).
  const precoPlano: Record<string, number> = { ...PRECO_FALLBACK }
  for (const p of (planos ?? []) as Array<{ id: string; preco_centavos: number | null }>) {
    if (p.id) precoPlano[p.id] = (p.preco_centavos ?? 0) / 100
  }

  const ativas = lista.filter(e => e.status === 'ativo')
  const cancelados = lista.filter(e => e.status === 'cancelado')

  // Churn: canceladas sobre a base que já foi paga (ativas + canceladas).
  const baseChurn = ativas.length + cancelados.length
  const churnPct = baseChurn > 0 ? (cancelados.length / baseChurn) * 100 : 0

  // 1) Novos tenants por mês (últimos 6 meses)
  const meses: { label: string; chave: string; total: number }[] = []
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

  // 2) MRR por plano (apenas ativas geram receita)
  const planosPagos = Array.from(new Set(ativas.map(e => e.plano).filter(p => p && p !== 'free'))) as string[]
  const mrrPorPlano = planosPagos
    .map(plano => {
      const qtd = ativas.filter(e => e.plano === plano).length
      return { plano, qtd, mrr: qtd * (precoPlano[plano] ?? 0) }
    })
    .sort((a, b) => b.mrr - a.mrr)
  const mrrTotal = mrrPorPlano.reduce((acc, p) => acc + p.mrr, 0)

  // 3) Empresas por segmento
  const segAgg = new Map<string, number>()
  lista.forEach(e => {
    const seg = normalizarSegmento(e.segmento)
    segAgg.set(seg, (segAgg.get(seg) ?? 0) + 1)
  })
  const porSegmento = [...segAgg.entries()]
    .map(([seg, qtd]) => ({ seg, label: SEG_LABEL[seg] ?? seg, qtd }))
    .sort((a, b) => b.qtd - a.qtd)
  const maxSeg = Math.max(1, ...porSegmento.map(s => s.qtd))

  // 4) Uso vs. limite + última atividade (por empresa ativa)
  const usos = await Promise.all(
    ativas.map(async e => {
      const [{ count: leads }, { count: usuarios }, { data: ultimoLead }] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', e.id),
        supabase.from('empresa_usuarios').select('*', { count: 'exact', head: true }).eq('empresa_id', e.id).eq('ativo', true),
        supabase.from('leads').select('created_at').eq('empresa_id', e.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      const limLeads = e.limite_leads ?? 0
      const limUsuarios = e.limite_usuarios ?? 0
      const pctLeads = limLeads > 0 ? ((leads ?? 0) / limLeads) * 100 : 0
      const pctUsuarios = limUsuarios > 0 ? ((usuarios ?? 0) / limUsuarios) * 100 : 0
      const ult = ultimoLead?.created_at ? new Date(ultimoLead.created_at) : null
      return {
        id: e.id,
        nome: e.nome,
        leads: leads ?? 0,
        limLeads,
        usuarios: usuarios ?? 0,
        limUsuarios,
        pctMax: Math.max(pctLeads, pctUsuarios),
        ultAtividade: ult,
        diasInativo: ult ? diasDesde(ult, hoje) : null,
      }
    })
  )

  const proximasLimite = usos
    .filter(u => u.pctMax >= 70)
    .sort((a, b) => b.pctMax - a.pctMax)

  // Risco de churn: ativas sem nenhum lead há 14+ dias (ou nunca tiveram lead).
  const risco = usos
    .filter(u => u.diasInativo == null || u.diasInativo >= 14)
    .sort((a, b) => (b.diasInativo ?? 9999) - (a.diasInativo ?? 9999))

  return (
    <div className="min-h-full bg-bg px-8 py-7">
      <div className="mx-auto max-w-[1400px] space-y-5">

        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Métricas</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Crescimento, receita, churn e capacidade dos tenants</p>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
          <StatCard bare label="MRR estimado" value={fmtBRL(mrrTotal)} />
          <StatCard bare label="Tenants ativos" value={ativas.length} delta={`${lista.length} no total`} deltaTone="neutral" />
          <StatCard
            bare
            label="Churn"
            value={`${churnPct.toFixed(1)}%`}
            delta={`${cancelados.length} cancelada${cancelados.length === 1 ? '' : 's'}`}
            deltaTone={churnPct > 0 ? 'bad' : 'ok'}
          />
          <StatCard
            bare
            label="Em risco"
            value={risco.length}
            delta="inativos 14+ dias"
            deltaTone={risco.length > 0 ? 'warn' : 'ok'}
          />
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
            {mrrPorPlano.length === 0 ? (
              <p className="text-[13px] text-ink-3">Nenhum tenant pagante ativo ainda.</p>
            ) : (
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
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Empresas por segmento */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Layers size={17} strokeWidth={1.7} style={{ color: ROXO }} />
                Empresas por segmento
              </span>
            }
          >
            {porSegmento.length === 0 ? (
              <p className="text-[13px] text-ink-3">Nenhuma empresa cadastrada.</p>
            ) : (
              <div className="space-y-3">
                {porSegmento.map(s => (
                  <div key={s.seg}>
                    <div className="mb-1.5 flex justify-between text-[13px]">
                      <span className="font-semibold text-ink-2">{s.label}</span>
                      <span className="num font-bold text-ink">{s.qtd}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(s.qtd / maxSeg) * 100}%`, background: ROXO }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Tenants em risco de churn */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Clock size={17} strokeWidth={1.7} className="text-warn" />
                Risco de churn
              </span>
            }
            actions={<span className="text-[12px] text-ink-3">sem lead há 14+ dias</span>}
          >
            {risco.length === 0 ? (
              <p className="py-4 text-[13px] text-ink-3">Todos os tenants ativos tiveram atividade recente.</p>
            ) : (
              <div className="space-y-2">
                {risco.map(u => (
                  <Link
                    key={u.id}
                    href={`/superadmin/empresas/${u.id}`}
                    className="flex items-center gap-4 rounded-card border border-line-soft p-3 transition-colors hover:bg-raised"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink">{u.nome}</div>
                      <div className="text-[12px] text-ink-3">
                        {u.diasInativo == null ? 'Nenhum lead recebido' : `Último lead há ${u.diasInativo} dias`}
                      </div>
                    </div>
                    <Badge tone="warn">{u.diasInativo == null ? 'sem uso' : `${u.diasInativo}d`}</Badge>
                  </Link>
                ))}
              </div>
            )}
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
