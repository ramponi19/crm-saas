import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getKanbanColumns, ganhoColId } from '@/components/modules/leads/types'
import { Home, Target, TrendingUp, Wallet } from 'lucide-react'
import { Card, StatCard } from '@/components/ui'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const STATUS_LABEL: Record<string, string> = {
  disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', alugado: 'Alugado', inativo: 'Inativo',
}

function Barra({ label, valor, max, cor }: { label: string; valor: number; max: number; cor?: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-[140px] shrink-0 truncate text-right text-[12.5px] text-ink-2">{label}</div>
      <div className="h-[22px] flex-1 overflow-hidden rounded-control bg-ink/[0.05]">
        <div className="flex h-full items-center justify-end rounded-control pr-2" style={{ width: `${Math.max(pct, valor > 0 ? 8 : 0)}%`, background: cor ?? '#2E5CE6' }}>
          {pct >= 18 && <span className="num text-[10.5px] font-bold text-white">{valor}</span>}
        </div>
      </div>
      {pct < 18 && <span className="num w-8 text-[11.5px] font-semibold text-ink-2">{valor}</span>}
    </div>
  )
}

/** Relatório imobiliário (server). Renderizado por /relatorios quando segmento=imobiliaria. */
export async function RelatoriosImobView() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: leads }, { data: imoveis }, { data: membros }] = await Promise.all([
    supabase.from('leads').select('kanban_status, origem, responsavel_id').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('imoveis').select('status, tipo, valor_venda').eq('empresa_id', empresaId),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const L = leads ?? []
  const I = imoveis ?? []
  const colunas = getKanbanColumns('imobiliaria')
  const fechamentoId = ganhoColId(colunas)

  const imoveisDisp = I.filter((i) => i.status === 'disponivel')
  const leadsFechados = L.filter((l) => l.kanban_status === fechamentoId).length
  const taxaConv = L.length > 0 ? Math.round((leadsFechados / L.length) * 100) : 0
  const valorCarteira = imoveisDisp.reduce((s, i) => s + (Number(i.valor_venda) || 0), 0)

  const kpis = [
    { icon: Home, label: 'Imóveis disponíveis', valor: `${imoveisDisp.length}`, sub: `${I.length} no total` },
    { icon: Target, label: 'Leads ativos', valor: `${L.length}`, sub: `${leadsFechados} fechados` },
    { icon: TrendingUp, label: 'Taxa de conversão', valor: `${taxaConv}%`, sub: 'fechados / leads' },
    { icon: Wallet, label: 'Valor em carteira', valor: brl(valorCarteira), sub: 'imóveis disponíveis' },
  ]

  const funil = colunas.map((c) => ({ label: c.label, cor: c.color, valor: L.filter((l) => (l.kanban_status ?? 'novo') === c.id).length }))
  const maxFunil = Math.max(1, ...funil.map((f) => f.valor))

  const origemMap: Record<string, number> = {}
  for (const l of L) { const o = l.origem || 'não informado'; origemMap[o] = (origemMap[o] ?? 0) + 1 }
  const origens = Object.entries(origemMap).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)
  const maxOrigem = Math.max(1, ...origens.map((o) => o.valor))

  const nomePorId: Record<string, string> = {}
  for (const m of (membros ?? []) as Array<{ usuario_id: string; usuarios: { nome: string } | { nome: string }[] | null }>) {
    const u = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios
    nomePorId[m.usuario_id] = u?.nome ?? '—'
  }
  const corretorMap: Record<string, { total: number; fechados: number }> = {}
  for (const l of L) {
    const key = l.responsavel_id ?? 'sem'
    corretorMap[key] = corretorMap[key] ?? { total: 0, fechados: 0 }
    corretorMap[key].total++
    if (l.kanban_status === fechamentoId) corretorMap[key].fechados++
  }
  const corretores = Object.entries(corretorMap)
    .map(([id, v]) => ({ nome: id === 'sem' ? 'Sem responsável' : (nomePorId[id] ?? '—'), ...v }))
    .sort((a, b) => b.total - a.total)
  const maxCorretor = Math.max(1, ...corretores.map((c) => c.total))

  const statusMap: Record<string, number> = {}
  for (const i of I) { statusMap[i.status] = (statusMap[i.status] ?? 0) + 1 }
  const tipoMap: Record<string, number> = {}
  for (const i of I) { tipoMap[i.tipo] = (tipoMap[i.tipo] ?? 0) + 1 }
  const porStatus = Object.entries(statusMap).map(([k, v]) => ({ label: STATUS_LABEL[k] ?? cap(k), valor: v }))
  const porTipo = Object.entries(tipoMap).map(([k, v]) => ({ label: cap(k), valor: v })).sort((a, b) => b.valor - a.valor)
  const maxStatus = Math.max(1, ...porStatus.map((s) => s.valor))
  const maxTipo = Math.max(1, ...porTipo.map((t) => t.valor))

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[1100px] space-y-4">
        <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
          {kpis.map((k) => <StatCard key={k.label} bare label={k.label} value={k.valor} delta={k.sub} deltaTone="neutral" />)}
        </div>

        <Card title="Funil de vendas (leads por etapa)">
          <div className="space-y-2">
            {funil.map((f) => <Barra key={f.label} label={f.label} valor={f.valor} max={maxFunil} cor={f.cor} />)}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Origem dos leads">
            <div className="space-y-2">
              {origens.length === 0 ? <p className="text-[13px] text-ink-3">Sem leads ainda.</p>
                : origens.map((o) => <Barra key={o.label} label={o.label} valor={o.valor} max={maxOrigem} />)}
            </div>
          </Card>
          <Card title="Desempenho por corretor">
            <div className="space-y-2">
              {corretores.length === 0 ? <p className="text-[13px] text-ink-3">Sem leads ainda.</p>
                : corretores.map((c) => (
                  <div key={c.nome} className="flex items-center gap-3">
                    <div className="w-[140px] shrink-0 truncate text-right text-[12.5px] text-ink-2">{c.nome}</div>
                    <div className="h-[22px] flex-1 overflow-hidden rounded-control bg-ink/[0.05]">
                      <div className="h-full rounded-control bg-ink" style={{ width: `${Math.max(Math.round((c.total / maxCorretor) * 100), 6)}%` }} />
                    </div>
                    <span className="num w-[70px] text-[11.5px] font-semibold text-ink-2">{c.total} · {c.fechados}✓</span>
                  </div>
                ))}
            </div>
          </Card>
          <Card title="Imóveis por status">
            <div className="space-y-2">
              {porStatus.length === 0 ? <p className="text-[13px] text-ink-3">Sem imóveis ainda.</p>
                : porStatus.map((s) => <Barra key={s.label} label={s.label} valor={s.valor} max={maxStatus} cor="#188A54" />)}
            </div>
          </Card>
          <Card title="Imóveis por tipo">
            <div className="space-y-2">
              {porTipo.length === 0 ? <p className="text-[13px] text-ink-3">Sem imóveis ainda.</p>
                : porTipo.map((t) => <Barra key={t.label} label={t.label} valor={t.valor} max={maxTipo} />)}
            </div>
          </Card>
        </div>
      </div>
    </main>
  )
}
