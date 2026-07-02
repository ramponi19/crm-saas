import Link from 'next/link'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getKanbanColumns } from '@/components/modules/leads/types'
import { Topbar } from '@/components/layout/topbar'
import { Target, CalendarCheck, Sparkles, Handshake, Home, ArrowUpRight, Clock, CircleAlert, CheckSquare } from 'lucide-react'

const GOLD = '#C9A24B'

type LeadRow = { nome: string | null; kanban_status: string | null; origem: string | null; responsavel_id: string | null; ultima_mensagem_at: string | null; created_at: string | null }
type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaMes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

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
    { icon: Target, label: `Leads ativos (${escopo})`, valor: leads.length, cor: GOLD },
    { icon: Sparkles, label: 'Leads novos', valor: porEtapa('novo'), cor: '#7FB0E8' },
    { icon: CalendarCheck, label: 'Visitas agendadas', valor: porEtapa('visita_agendada'), cor: '#A78BFA' },
    { icon: Handshake, label: 'Em proposta', valor: porEtapa('proposta'), cor: '#F4B740' },
  ]
  const maxFunil = Math.max(1, ...colunas.map(c => porEtapa(c.id)))
  const recentes = leads.slice(0, 6)

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Início" />
      <div className="p-6 max-w-[1100px]">
        <div className="mb-6">
          <h2 className="text-[22px] font-bold text-[#16212E]">Olá, {primeiroNome} 👋</h2>
          <p className="text-[13.5px] text-[#788698]">Aqui está {isGestor ? 'a operação da equipe' : 'sua operação'} hoje.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpis.map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
                <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center mb-3" style={{ background: `${k.cor}1F`, color: k.cor }}><Icon size={19} /></div>
                <div className="text-[26px] font-extrabold text-[#16212E] leading-none">{k.valor}</div>
                <div className="text-[12px] text-[#788698] mt-1.5">{k.label}</div>
              </div>
            )
          })}
        </div>

        {/* Cockpit do dia: visitas de hoje + follow-ups pendentes */}
        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold text-[#16212E] inline-flex items-center gap-2"><Clock size={16} style={{ color: GOLD }} /> Visitas de hoje</h3>
              <Link href="/agenda" className="text-[12px] font-semibold inline-flex items-center gap-1" style={{ color: GOLD }}>Agenda <ArrowUpRight size={13} /></Link>
            </div>
            {visitasHoje.length === 0 ? (
              <p className="text-[13px] text-[#9AA7B6] py-2">Nenhuma visita agendada para hoje.</p>
            ) : (
              <div className="space-y-1">
                {visitasHoje.map(v => (
                  <div key={v.id} className="flex items-center gap-3 py-2 border-b border-[#16212E]/[0.05] last:border-0">
                    <span className="text-[13px] font-extrabold text-[#16212E] w-[46px] shrink-0">{hora(v.data_hora)}</span>
                    <span className="text-[13px] text-[#16212E] truncate flex-1">{v.lead_nome || 'Visita'}</span>
                    {v.status !== 'agendada' && <span className="text-[10.5px] text-[#788698] shrink-0 capitalize">{v.status}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold text-[#16212E] inline-flex items-center gap-2"><CheckSquare size={16} style={{ color: GOLD }} /> Follow-ups pendentes</h3>
              <Link href="/tarefas" className="text-[12px] font-semibold inline-flex items-center gap-1" style={{ color: GOLD }}>Tarefas <ArrowUpRight size={13} /></Link>
            </div>
            {tarefasPend.length === 0 ? (
              <p className="text-[13px] text-[#9AA7B6] py-2">Tudo em dia. 🎯</p>
            ) : (
              <div className="space-y-1">
                {tarefasPend.map(t => {
                  const atrasada = t.vencimento && new Date(t.vencimento).getTime() < nowMs
                  return (
                    <div key={t.id} className="flex items-center gap-2 py-2 border-b border-[#16212E]/[0.05] last:border-0">
                      {atrasada ? <CircleAlert size={15} className="text-[#DC2626] shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GOLD }} />}
                      <span className="text-[13px] text-[#16212E] truncate flex-1">{t.titulo}{t.lead_nome ? <span className="text-[#9AA7B6]"> · {t.lead_nome}</span> : ''}</span>
                      {t.vencimento && <span className={`text-[11px] shrink-0 ${atrasada ? 'text-[#DC2626] font-semibold' : 'text-[#9AA7B6]'}`}>{diaMes(t.vencimento)}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Meu funil */}
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-bold text-[#16212E]">Funil {isGestor ? 'da equipe' : 'de vendas'}</h3>
              <Link href="/leads" className="text-[12px] font-semibold inline-flex items-center gap-1" style={{ color: GOLD }}>Abrir Leads <ArrowUpRight size={13} /></Link>
            </div>
            <div className="space-y-2">
              {colunas.map(c => {
                const v = porEtapa(c.id)
                const pct = Math.round((v / maxFunil) * 100)
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="w-[130px] text-[12px] text-[#56657A] truncate shrink-0 text-right">{c.label}</div>
                    <div className="flex-1 h-[20px] bg-[#16212E]/[0.05] rounded-[6px] overflow-hidden">
                      <div className="h-full rounded-[6px]" style={{ width: `${Math.max(pct, v > 0 ? 6 : 0)}%`, background: c.color }} />
                    </div>
                    <span className="text-[11.5px] font-semibold text-[#56657A] w-6">{v}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Últimos leads + atalho imóveis */}
          <div className="space-y-5">
            <Link href="/imoveis" className="flex items-center gap-3 bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5 hover:border-[rgba(201,162,75,.5)] transition-colors">
              <div className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center" style={{ background: `${GOLD}18`, color: GOLD }}><Home size={20} /></div>
              <div className="flex-1"><div className="text-[20px] font-extrabold text-[#16212E] leading-none">{imoveisDisp ?? 0}</div><div className="text-[12px] text-[#788698]">imóveis disponíveis</div></div>
              <ArrowUpRight size={18} className="text-[#B0BCC9]" />
            </Link>

            <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
              <h3 className="text-[14px] font-bold text-[#16212E] mb-3">Últimos leads</h3>
              {recentes.length === 0 ? (
                <p className="text-[13px] text-[#9AA7B6]">Nenhum lead ainda.</p>
              ) : (
                <div className="space-y-1">
                  {recentes.map((l, i) => {
                    const col = colunas.find(c => c.id === (l.kanban_status ?? 'novo'))
                    return (
                      <Link key={i} href="/leads" className="flex items-center gap-2 py-2 border-b border-[#16212E]/[0.05] last:border-0 hover:bg-[#16212E]/[0.015] rounded px-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col?.color ?? GOLD }} />
                        <span className="text-[13px] font-medium text-[#16212E] truncate flex-1">{l.nome || 'Lead'}</span>
                        <span className="text-[11px] text-[#9AA7B6] shrink-0">{l.origem ?? ''}</span>
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full shrink-0" style={{ background: `${col?.color ?? GOLD}18`, color: col?.color ?? GOLD }}>{col?.label ?? ''}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
