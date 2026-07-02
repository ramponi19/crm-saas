import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
import { getKanbanColumns, ganhoColId } from '@/components/modules/leads/types'
import { Topbar } from '@/components/layout/topbar'
import { Home, Target, TrendingUp, Wallet } from 'lucide-react'

export const metadata = { title: 'Relatórios' }

const GOLD = '#C9A24B'
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const STATUS_LABEL: Record<string, string> = {
  disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', alugado: 'Alugado', inativo: 'Inativo',
}

function Barra({ label, valor, max, cor, sufixo }: { label: string; valor: number; max: number; cor: string; sufixo?: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-[140px] text-[12.5px] text-[#56657A] truncate shrink-0 text-right">{label}</div>
      <div className="flex-1 h-[22px] bg-[#16212E]/[0.05] rounded-[6px] overflow-hidden">
        <div className="h-full rounded-[6px] flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, valor > 0 ? 6 : 0)}%`, background: cor }}>
          {pct >= 18 && <span className="text-[10.5px] font-bold text-white">{valor}{sufixo}</span>}
        </div>
      </div>
      {pct < 18 && <span className="text-[11.5px] font-semibold text-[#56657A] w-8">{valor}{sufixo}</span>}
    </div>
  )
}

export default async function RelatoriosImobPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).single()
  if (normalizarSegmento(empresa?.segmento) !== 'imobiliaria') redirect('/dashboard')

  const [{ data: leads }, { data: imoveis }, { data: membros }] = await Promise.all([
    supabase.from('leads').select('kanban_status, origem, responsavel_id').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('imoveis').select('status, tipo, valor_venda').eq('empresa_id', empresaId),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const L = leads ?? []
  const I = imoveis ?? []
  const colunas = getKanbanColumns('imobiliaria')
  const fechamentoId = ganhoColId(colunas)

  // KPIs
  const imoveisDisp = I.filter(i => i.status === 'disponivel')
  const leadsFechados = L.filter(l => l.kanban_status === fechamentoId).length
  const taxaConv = L.length > 0 ? Math.round((leadsFechados / L.length) * 100) : 0
  const valorCarteira = imoveisDisp.reduce((s, i) => s + (Number(i.valor_venda) || 0), 0)

  const kpis = [
    { icon: Home, label: 'Imóveis disponíveis', valor: `${imoveisDisp.length}`, sub: `${I.length} no total` },
    { icon: Target, label: 'Leads ativos', valor: `${L.length}`, sub: `${leadsFechados} fechados` },
    { icon: TrendingUp, label: 'Taxa de conversão', valor: `${taxaConv}%`, sub: 'fechados / leads' },
    { icon: Wallet, label: 'Valor em carteira', valor: brl(valorCarteira), sub: 'imóveis disponíveis' },
  ]

  // Funil (leads por etapa)
  const funil = colunas.map(c => ({ label: c.label, cor: c.color, valor: L.filter(l => (l.kanban_status ?? 'novo') === c.id).length }))
  const maxFunil = Math.max(1, ...funil.map(f => f.valor))

  // Origem dos leads
  const origemMap: Record<string, number> = {}
  for (const l of L) { const o = l.origem || 'não informado'; origemMap[o] = (origemMap[o] ?? 0) + 1 }
  const origens = Object.entries(origemMap).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)
  const maxOrigem = Math.max(1, ...origens.map(o => o.valor))

  // Corretores
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
  const maxCorretor = Math.max(1, ...corretores.map(c => c.total))

  // Imóveis por status / tipo
  const statusMap: Record<string, number> = {}
  for (const i of I) { statusMap[i.status] = (statusMap[i.status] ?? 0) + 1 }
  const tipoMap: Record<string, number> = {}
  for (const i of I) { tipoMap[i.tipo] = (tipoMap[i.tipo] ?? 0) + 1 }
  const porStatus = Object.entries(statusMap).map(([k, v]) => ({ label: STATUS_LABEL[k] ?? cap(k), valor: v }))
  const porTipo = Object.entries(tipoMap).map(([k, v]) => ({ label: cap(k), valor: v })).sort((a, b) => b.valor - a.valor)
  const maxStatus = Math.max(1, ...porStatus.map(s => s.valor))
  const maxTipo = Math.max(1, ...porTipo.map(t => t.valor))

  const Card = ({ children, titulo }: { children: React.ReactNode; titulo: string }) => (
    <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
      <h3 className="text-[14px] font-bold text-[#16212E] mb-4">{titulo}</h3>
      {children}
    </div>
  )

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Relatórios" />
      <div className="p-6 max-w-[1100px] space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
                <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center mb-3" style={{ background: `${GOLD}18`, color: GOLD }}><Icon size={19} /></div>
                <div className="text-[24px] font-extrabold text-[#16212E] leading-none">{k.valor}</div>
                <div className="text-[12px] text-[#788698] mt-1.5">{k.label}</div>
                <div className="text-[11px] text-[#9AA7B6]">{k.sub}</div>
              </div>
            )
          })}
        </div>

        <Card titulo="Funil de vendas (leads por etapa)">
          <div className="space-y-2">
            {funil.map(f => <Barra key={f.label} label={f.label} valor={f.valor} max={maxFunil} cor={f.cor} />)}
          </div>
        </Card>

        <div className="grid lg:grid-cols-2 gap-5">
          <Card titulo="Origem dos leads">
            <div className="space-y-2">
              {origens.length === 0 ? <p className="text-[13px] text-[#9AA7B6]">Sem leads ainda.</p>
                : origens.map(o => <Barra key={o.label} label={o.label} valor={o.valor} max={maxOrigem} cor={GOLD} />)}
            </div>
          </Card>

          <Card titulo="Desempenho por corretor">
            <div className="space-y-2">
              {corretores.length === 0 ? <p className="text-[13px] text-[#9AA7B6]">Sem leads ainda.</p>
                : corretores.map(c => (
                  <div key={c.nome} className="flex items-center gap-3">
                    <div className="w-[140px] text-[12.5px] text-[#56657A] truncate shrink-0 text-right">{c.nome}</div>
                    <div className="flex-1 h-[22px] bg-[#16212E]/[0.05] rounded-[6px] overflow-hidden">
                      <div className="h-full rounded-[6px]" style={{ width: `${Math.max(Math.round((c.total / maxCorretor) * 100), 6)}%`, background: '#141E2C' }} />
                    </div>
                    <span className="text-[11.5px] font-semibold text-[#56657A] w-[70px]">{c.total} · {c.fechados}✓</span>
                  </div>
                ))}
            </div>
          </Card>

          <Card titulo="Imóveis por status">
            <div className="space-y-2">
              {porStatus.length === 0 ? <p className="text-[13px] text-[#9AA7B6]">Sem imóveis ainda.</p>
                : porStatus.map(s => <Barra key={s.label} label={s.label} valor={s.valor} max={maxStatus} cor="#22D3B0" />)}
            </div>
          </Card>

          <Card titulo="Imóveis por tipo">
            <div className="space-y-2">
              {porTipo.length === 0 ? <p className="text-[13px] text-[#9AA7B6]">Sem imóveis ainda.</p>
                : porTipo.map(t => <Barra key={t.label} label={t.label} valor={t.valor} max={maxTipo} cor={GOLD} />)}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
