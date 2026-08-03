import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getKanbanColumns, ganhoColId } from '@/components/modules/leads/types'
import { Home, Target, TrendingUp, Wallet, Award } from 'lucide-react'
import { Card, StatCard, Badge } from '@/components/ui'
import { RelatorioPerdas } from './relatorio-perdas'

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

  // Janela do mês corrente (ranking mensal).
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1).toISOString()
  const nomeMes = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const [{ data: leads }, { data: imoveis }, { data: membros }, { data: leadsMes }, { data: visitasMes }, { data: propostasMes }] = await Promise.all([
    supabase.from('leads').select('kanban_status, origem, responsavel_id').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('imoveis').select('status, tipo, valor_venda').eq('empresa_id', empresaId),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('leads').select('responsavel_id').eq('empresa_id', empresaId).gte('created_at', inicioMes).lt('created_at', fimMes),
    supabase.from('visitas').select('corretor_id').eq('empresa_id', empresaId).eq('status', 'realizada').gte('data_hora', inicioMes).lt('data_hora', fimMes),
    supabase.from('propostas').select('status, lead_id').eq('empresa_id', empresaId).gte('created_at', inicioMes).lt('created_at', fimMes),
  ])

  // Responsável de cada lead citado nas propostas do mês (sem embed — resolve por lookup).
  const propMes = (propostasMes ?? []) as Array<{ status: string; lead_id: number | null }>
  const leadIdsProp = [...new Set(propMes.map((p) => p.lead_id).filter((v): v is number => v != null))]
  const respPorLead: Record<number, string | null> = {}
  if (leadIdsProp.length) {
    const { data: lr } = await supabase.from('leads').select('id, responsavel_id').in('id', leadIdsProp)
    for (const l of (lr ?? []) as Array<{ id: number; responsavel_id: string | null }>) respPorLead[l.id] = l.responsavel_id
  }

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

  // Ranking mensal por pontos (atendimento 1 · visita 2 · proposta 3 · fechamento 5).
  const PESOS = { atendimento: 1, visita: 2, proposta: 3, fechamento: 5 }
  type Pontos = { atend: number; visitas: number; propostas: number; fechamentos: number }
  const rankMap: Record<string, Pontos> = {}
  const ini = (k: string) => (rankMap[k] = rankMap[k] ?? { atend: 0, visitas: 0, propostas: 0, fechamentos: 0 })
  for (const l of (leadsMes ?? []) as Array<{ responsavel_id: string | null }>) if (l.responsavel_id) ini(l.responsavel_id).atend++
  for (const v of (visitasMes ?? []) as Array<{ corretor_id: string | null }>) if (v.corretor_id) ini(v.corretor_id).visitas++
  for (const p of propMes) {
    const rid = p.lead_id != null ? respPorLead[p.lead_id] : null
    if (!rid) continue
    ini(rid).propostas++
    if (p.status === 'aceita') ini(rid).fechamentos++
  }
  const ranking = Object.entries(rankMap)
    .map(([id, v]) => ({
      nome: nomePorId[id] ?? '—', ...v,
      pontos: v.atend * PESOS.atendimento + v.visitas * PESOS.visita + v.propostas * PESOS.proposta + v.fechamentos * PESOS.fechamento,
    }))
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)

  const statusMap: Record<string, number> = {}
  for (const i of I) { statusMap[i.status] = (statusMap[i.status] ?? 0) + 1 }
  const tipoMap: Record<string, number> = {}
  for (const i of I) { tipoMap[i.tipo] = (tipoMap[i.tipo] ?? 0) + 1 }
  const porStatus = Object.entries(statusMap).map(([k, v]) => ({ label: STATUS_LABEL[k] ?? cap(k), valor: v }))
  const porTipo = Object.entries(tipoMap).map(([k, v]) => ({ label: cap(k), valor: v })).sort((a, b) => b.valor - a.valor)
  const maxStatus = Math.max(1, ...porStatus.map((s) => s.valor))
  const maxTipo = Math.max(1, ...porTipo.map((t) => t.valor))

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
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
        <Card title={
          <span className="flex items-center gap-2">
            <Award size={16} strokeWidth={1.7} className="text-accent" />
            Ranking de corretores · <span className="font-normal capitalize text-ink-2">{nomeMes}</span>
          </span>
        }>
          <p className="-mt-1 mb-3 text-[11.5px] text-ink-3">Pontos: atendimento ×1 · visita ×2 · proposta ×3 · fechamento ×5 (proposta aceita).</p>
          {ranking.length === 0 ? (
            <p className="text-[13px] text-ink-3">Sem atividade neste mês ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line-soft text-left text-[11px] uppercase tracking-[0.05em] text-ink-3">
                    <th className="py-1.5 pr-2 font-semibold">#</th>
                    <th className="py-1.5 pr-2 font-semibold">Corretor</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Atend.</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Visitas</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Propostas</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Fech.</th>
                    <th className="py-1.5 pl-2 text-right font-semibold">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.nome} className="border-b border-line-soft/60">
                      <td className="py-2 pr-2">{i === 0 ? <Badge tone="ok">1º</Badge> : <span className="num text-ink-3">{i + 1}º</span>}</td>
                      <td className="py-2 pr-2 font-semibold text-ink">{r.nome}</td>
                      <td className="num py-2 pr-2 text-right text-ink-2">{r.atend}</td>
                      <td className="num py-2 pr-2 text-right text-ink-2">{r.visitas}</td>
                      <td className="num py-2 pr-2 text-right text-ink-2">{r.propostas}</td>
                      <td className="num py-2 pr-2 text-right text-ink-2">{r.fechamentos}</td>
                      <td className="num py-2 pl-2 text-right font-bold text-ink">{r.pontos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="mt-4"><RelatorioPerdas /></div>
      </div>
    </main>
  )
}
