import Link from 'next/link'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getKanbanColumns, type KanbanColumn } from '@/components/modules/leads/types'
import { Topbar } from '@/components/layout/topbar'
import { Home, Clock, CircleAlert, CheckSquare, ArrowUpRight } from 'lucide-react'
import { Card, StatCard, Badge } from '@/components/ui'

type LeadRow = { nome: string | null; kanban_status: string | null; origem: string | null; responsavel_id: string | null; ultima_mensagem_at: string | null; created_at: string | null }
type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaMes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

// Tom do chip (token) conforme o papel da etapa do funil.
const toneEtapa = (c?: KanbanColumn): 'neutro' | 'acc' | 'ok' | 'warn' | 'bad' =>
  c?.tipo === 'ganho' ? 'ok' : c?.tipo === 'perdido' ? 'bad' : c?.tipo === 'negociacao' ? 'warn' : 'neutro'

// Barra de funil — cor da etapa vem do dado (kanban), via inline style (idiom migrado).
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

/** Dashboard operacional do corretor (segmento imobiliária). Pessoal p/ corretor,
 *  visão da equipe p/ dono/admin. Foco: meus leads, visitas, funil. */
export default async function DashboardImob() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: usuario }, { data: vinculo }] = await Promise.all([
    supabase.from('usuarios').select('nome').eq('id', user!.id).single(),
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user!.id).eq('empresa_id', empresaId).maybeSingle(),
  ])
  const isGestor = ['owner', 'admin'].includes(vinculo?.role ?? '')

  let q = supabase.from('leads')
    .select('nome, kanban_status, origem, responsavel_id, ultima_mensagem_at, created_at')
    .eq('empresa_id', empresaId).eq('ativo', true)
  if (!isGestor && user) q = q.eq('responsavel_id', user.id)

  // janela de "hoje" (local) para as visitas do cockpit
  const agora = new Date()
  const iniHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString()
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).toISOString()

  let vq = supabase.from('visitas').select('id, data_hora, status, leads(nome)')
    .eq('empresa_id', empresaId).gte('data_hora', iniHoje).lt('data_hora', fimHoje).order('data_hora')
  if (!isGestor && user) vq = vq.eq('corretor_id', user.id)

  let tq = supabase.from('tarefas').select('id, titulo, vencimento, leads(nome)')
    .eq('empresa_id', empresaId).eq('concluida', false).order('vencimento', { nullsFirst: false }).limit(8)
  if (!isGestor && user) tq = tq.eq('responsavel_id', user.id)

  const [{ data: leadsRaw }, { count: imoveisDisp }, { data: visitasRaw }, { data: tarefasRaw }] = await Promise.all([
    q.order('ultima_mensagem_at', { ascending: false, nullsFirst: false }).limit(400),
    supabase.from('imoveis').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'disponivel'),
    vq,
    tq,
  ])
  const leads = (leadsRaw ?? []) as LeadRow[]

  type VisitaRow = { id: number; data_hora: string; status: string; leads: Embed<{ nome: string | null }> }
  type TarefaRow = { id: number; titulo: string; vencimento: string | null; leads: Embed<{ nome: string | null }> }
  const visitasHoje = ((visitasRaw ?? []) as unknown as VisitaRow[]).map(v => ({ ...v, lead_nome: one(v.leads)?.nome ?? null }))
  const tarefasPend = ((tarefasRaw ?? []) as unknown as TarefaRow[]).map(t => ({ ...t, lead_nome: one(t.leads)?.nome ?? null }))
  const nowMs = agora.getTime()

  const colunas = getKanbanColumns('imobiliaria')
  const porEtapa = (id: string) => leads.filter(l => (l.kanban_status ?? 'novo') === id).length

  const escopo = isGestor ? 'da equipe' : 'suas'
  const primeiroNome = (usuario?.nome ?? '').split(' ')[0] || 'corretor'

  const kpis = [
    { label: `Leads ativos (${escopo})`, valor: leads.length },
    { label: 'Leads novos', valor: porEtapa('novo') },
    { label: 'Visitas agendadas', valor: porEtapa('visita_agendada') },
    { label: 'Em proposta', valor: porEtapa('proposta') },
  ]
  const maxFunil = Math.max(1, ...colunas.map(c => porEtapa(c.id)))
  const recentes = leads.slice(0, 6)

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Início" />

      <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1100px] space-y-4">

          {/* Header */}
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Olá, {primeiroNome}.</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">Aqui está {isGestor ? 'a operação da equipe' : 'sua operação'} hoje.</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            {kpis.map(k => <StatCard key={k.label} bare label={k.label} value={k.valor} />)}
          </div>

          {/* Cockpit do dia: visitas de hoje + follow-ups pendentes */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Visitas de hoje" actions={<Link href="/agenda" className="text-[12px] font-semibold text-accent hover:underline">Agenda →</Link>}>
              {visitasHoje.length === 0 ? (
                <p className="text-[13px] text-ink-3">Nenhuma visita agendada para hoje.</p>
              ) : (
                <div>
                  {visitasHoje.map(v => (
                    <div key={v.id} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
                      <span className="num w-[46px] flex-none text-[13px] font-semibold text-ink">{hora(v.data_hora)}</span>
                      <span className="flex-1 truncate text-[13px] text-ink">{v.lead_nome || 'Visita'}</span>
                      {v.status !== 'agendada' && <Badge tone="neutro" className="capitalize">{v.status}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Follow-ups pendentes" actions={<Link href="/tarefas" className="text-[12px] font-semibold text-accent hover:underline">Tarefas →</Link>}>
              {tarefasPend.length === 0 ? (
                <p className="text-[13px] text-ink-3">Tudo em dia.</p>
              ) : (
                <div>
                  {tarefasPend.map(t => {
                    const atrasada = t.vencimento && new Date(t.vencimento).getTime() < nowMs
                    return (
                      <div key={t.id} className="flex items-center gap-2 border-b border-line-soft py-2.5 last:border-0">
                        {atrasada ? <CircleAlert size={15} strokeWidth={1.7} className="shrink-0 text-bad" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                        <span className="flex-1 truncate text-[13px] text-ink">{t.titulo}{t.lead_nome ? <span className="text-ink-3"> · {t.lead_nome}</span> : ''}</span>
                        {t.vencimento && <span className={`num text-[11px] shrink-0 ${atrasada ? 'font-semibold text-bad' : 'text-ink-3'}`}>{diaMes(t.vencimento)}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Meu funil */}
            <Card title={`Funil ${isGestor ? 'da equipe' : 'de vendas'}`} actions={<Link href="/leads" className="text-[12px] font-semibold text-accent hover:underline">Abrir Leads →</Link>}>
              <div className="space-y-2">
                {colunas.map(c => <Barra key={c.id} label={c.label} valor={porEtapa(c.id)} max={maxFunil} cor={c.color} />)}
              </div>
            </Card>

            {/* Últimos leads + atalho imóveis */}
            <div className="space-y-4">
              <Link href="/imoveis" className="flex items-center gap-3 rounded-card border border-line bg-card p-4 transition-colors hover:border-ink/20">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent"><Home size={19} strokeWidth={1.7} /></span>
                <div className="flex-1">
                  <div className="num text-[20px] font-bold leading-none text-ink">{imoveisDisp ?? 0}</div>
                  <div className="mt-1 text-[11px] text-ink-3">imóveis disponíveis</div>
                </div>
                <ArrowUpRight size={18} strokeWidth={1.7} className="text-ink-3" />
              </Link>

              <Card title="Últimos leads">
                {recentes.length === 0 ? (
                  <p className="text-[13px] text-ink-3">Nenhum lead ainda.</p>
                ) : (
                  <div>
                    {recentes.map((l, i) => {
                      const col = colunas.find(c => c.id === (l.kanban_status ?? 'novo'))
                      return (
                        <Link key={i} href="/leads" className="flex items-center gap-2.5 border-b border-line-soft py-2.5 transition-colors last:border-0 hover:bg-raised">
                          <span className="flex-1 truncate text-[13px] font-medium text-ink">{l.nome || 'Lead'}</span>
                          {l.origem && <span className="shrink-0 text-[11px] text-ink-3">{l.origem}</span>}
                          <Badge tone={toneEtapa(col)}>{col?.label ?? ''}</Badge>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>

        </div>
      </main>
    </>
  )
}
