import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getKanbanColumns, type KanbanColumn } from '@/components/modules/leads/types'
import { Topbar } from '@/components/layout/topbar'
import { Home, CircleAlert, ArrowUpRight, Users, CalendarDays } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import type { ScoreConfig } from '@/lib/lead-score'
import { TermometroLeads } from './termometro-leads'
import { LeadsParados, type LeadParado } from './leads-parados'

type LeadRow = {
  id: number; nome: string | null; kanban_status: string | null; origem: string | null
  responsavel_id: string | null; ultima_mensagem_at: string | null; ultima_tratativa: string | null
  created_at: string | null; telefone: string | null; instagram: string | null
  valor_estimado: number | null; msgs_nao_lidas: number | null
}
type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const diaMes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Lead sem nenhuma tratativa por mais dias que isto entra no painel de parados. */
const DIAS_PARADO = 7
/** Janela dos "próximos compromissos" — hoje mais os dias seguintes. */
const DIAS_AGENDA = 7

// Tom do chip (token) conforme o papel da etapa do funil.
const toneEtapa = (c?: KanbanColumn): 'neutro' | 'acc' | 'ok' | 'warn' | 'bad' =>
  c?.tipo === 'ganho' ? 'ok' : c?.tipo === 'perdido' ? 'bad' : c?.tipo === 'negociacao' ? 'warn' : 'neutro'

const STATUS_IMOVEL: Record<string, string> = {
  disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', alugado: 'Alugado', inativo: 'Inativo',
}

/** Dashboard operacional do corretor (segmento imobiliária). Pessoal p/ corretor,
 *  visão da equipe p/ dono/admin. Foco: meus leads, visitas, funil. */
export default async function DashboardImob() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  /**
   * Sessão e cadastro ausentes NÃO derrubam a tela.
   *
   * Havia `user!.id` e `.single()` aqui: o `!` estoura se o token expirar no meio
   * do carregamento, e o `.single()` lança quando o usuário autenticado ainda não
   * tem linha em `usuarios` — recém-convidado, por exemplo. Nos dois casos o
   * dashboard inteiro virava erro em vez de degradar. Sem sessão, manda para o
   * login; sem cadastro, segue como corretor comum.
   */
  if (!user) redirect('/login')

  const [{ data: usuario }, { data: vinculo }] = await Promise.all([
    supabase.from('usuarios').select('nome, is_super_admin').eq('id', user.id).maybeSingle(),
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).maybeSingle(),
  ])
  /**
   * Quem responde pela operação vê a operação inteira: dono, admin e super admin.
   *
   * O super admin precisa entrar na conta porque, operando uma empresa pelo modo
   * plataforma, ele não tem linha em `empresa_usuarios` — e caía como corretor
   * comum, vendo só os próprios leads, visitas e tarefas numa empresa onde não
   * tem nenhum.
   */
  const isGestor = !!usuario?.is_super_admin || ['owner', 'admin'].includes(vinculo?.role ?? '')

  /**
   * Os blocos que SOMAM (termômetro, parados, funil) contam sobre este recorte.
   * Ele é determinístico — ordenado pela última mensagem —, então o número não
   * dança entre dois carregamentos; mas é recorte, e passando disso a soma
   * deixaria de refletir a carteira inteira.
   */
  const TETO_LEADS = 400
  let q = supabase.from('leads')
    .select('id, nome, kanban_status, origem, responsavel_id, ultima_mensagem_at, ultima_tratativa, created_at, telefone, instagram, valor_estimado, msgs_nao_lidas')
    .eq('empresa_id', empresaId).eq('ativo', true)
  if (!isGestor) q = q.eq('responsavel_id', user.id)

  // janela de "hoje" (local) e a dos próximos dias, para a agenda do cockpit
  const agora = new Date()
  const iniHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString()
  const fimJanela = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + DIAS_AGENDA).toISOString()

  let vq = supabase.from('visitas').select('id, data_hora, status, leads(nome), imoveis(codigo, titulo)')
    .eq('empresa_id', empresaId).gte('data_hora', iniHoje).lt('data_hora', fimJanela).order('data_hora').limit(8)
  if (!isGestor) vq = vq.eq('corretor_id', user.id)

  /**
   * Quantos leads a carteira TEM, além de quantos esta tela carregou.
   *
   * O funil e o termômetro somam sobre o recorte de `TETO_LEADS`. Enquanto a
   * carteira é menor que o teto, recorte e total são a mesma coisa e ninguém
   * percebe; passando disso, os números encolhem sem avisar — e número que parece
   * calculado é pior que número ausente, porque ninguém desconfia dele. Um
   * `count` é barato (o banco nem devolve linha) e paga a honestidade.
   */
  let cq = supabase.from('leads').select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('ativo', true)
  if (!isGestor) cq = cq.eq('responsavel_id', user.id)

  let tq = supabase.from('tarefas').select('id, titulo, vencimento, leads(nome)')
    .eq('empresa_id', empresaId).eq('concluida', false).order('vencimento', { nullsFirst: false }).limit(8)
  if (!isGestor) tq = tq.eq('responsavel_id', user.id)

  const [
    { data: leadsRaw }, { count: imoveisDisp }, { count: imoveisTotal }, { count: totalClientes },
    { data: visitasRaw }, { data: tarefasRaw }, { data: scoreCfgRow }, { data: membrosRaw },
    { data: etapasRaw }, { data: ultimosClientesRaw }, { data: ultimosImoveisRaw },
    { count: totalLeadsCarteira },
  ] = await Promise.all([
    q.order('ultima_mensagem_at', { ascending: false, nullsFirst: false }).limit(TETO_LEADS),
    supabase.from('imoveis').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'disponivel'),
    supabase.from('imoveis').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true),
    vq,
    tq,
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle(),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    // Etapas do funil PADRÃO, do banco. A constante do segmento é só o fallback:
    // sem isto o dashboard mostraria um funil diferente do que o dono editou.
    supabase.from('funil_etapas').select('slug, label, cor, tipo, ordem, funil_id, funis!inner(padrao)')
      .eq('empresa_id', empresaId).eq('ativo', true).eq('funis.padrao', true).order('ordem'),
    supabase.from('clientes').select('id, nome, tipo_cliente, cidade, created_at')
      .eq('empresa_id', empresaId).eq('ativo', true).order('created_at', { ascending: false }).limit(5),
    supabase.from('imoveis').select('id, codigo, titulo, tipo, status, valor_venda, valor_locacao, finalidade, bairro')
      .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(5),
    cq,
  ])

  const leads = (leadsRaw ?? []) as LeadRow[]
  const scoreCfg = (scoreCfgRow?.valor ?? null) as Partial<ScoreConfig> | null

  type EtapaRow = { slug: string; label: string; cor: string; tipo: string; ordem: number }
  const doBanco = ((etapasRaw ?? []) as unknown as EtapaRow[]).map((e) => ({
    id: e.slug,
    label: e.label,
    color: e.cor,
    tipo: e.tipo === 'negociacao' || e.tipo === 'ganho' || e.tipo === 'perdido' ? e.tipo : undefined,
  })) as KanbanColumn[]
  const colunas = doBanco.length > 0 ? doBanco : getKanbanColumns('imobiliaria')

  type VisitaRow = { id: number; data_hora: string; status: string; leads: Embed<{ nome: string | null }>; imoveis: Embed<{ codigo: string | null; titulo: string | null }> }
  type TarefaRow = { id: number; titulo: string; vencimento: string | null; leads: Embed<{ nome: string | null }> }
  const proximos = ((visitasRaw ?? []) as unknown as VisitaRow[]).map(v => {
    const im = one(v.imoveis)
    return { ...v, lead_nome: one(v.leads)?.nome ?? null, imovel: im ? (im.codigo || im.titulo) : null }
  })
  const tarefasPend = ((tarefasRaw ?? []) as unknown as TarefaRow[]).map(t => ({ ...t, lead_nome: one(t.leads)?.nome ?? null }))
  const nowMs = agora.getTime()

  const nomePorUsuario = new Map(
    ((membrosRaw ?? []) as unknown as Array<{ usuario_id: string; usuarios: Embed<{ nome: string | null }> }>)
      .map(m => [m.usuario_id, one(m.usuarios)?.nome ?? '—'])
  )

  const porEtapa = (id: string) => leads.filter(l => (l.kanban_status ?? 'novo') === id).length

  /**
   * Parados: nenhuma mensagem nem tratativa há mais de DIAS_PARADO. Etapa
   * terminal fica de fora — lead ganho ou perdido não está "parado", está pronto.
   */
  const terminais = new Set(colunas.filter(c => c.tipo === 'ganho' || c.tipo === 'perdido').map(c => c.id))
  const parados: LeadParado[] = leads
    .filter(l => !terminais.has(l.kanban_status ?? 'novo'))
    .map(l => {
      const ref = l.ultima_mensagem_at ?? l.ultima_tratativa ?? l.created_at
      return {
        id: l.id,
        nome: l.nome || 'Lead sem nome',
        etapa: colunas.find(c => c.id === (l.kanban_status ?? 'novo'))?.label ?? '—',
        responsavel: l.responsavel_id ? (nomePorUsuario.get(l.responsavel_id) ?? '—') : 'sem dono',
        dias: ref ? Math.floor((nowMs - new Date(ref).getTime()) / 864e5) : 0,
      }
    })
    .filter(l => l.dias >= DIAS_PARADO)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 6)

  type ClienteRow = { id: number; nome: string; tipo_cliente: string | null; cidade: string | null; created_at: string | null }
  type ImovelRow = { id: number; codigo: string | null; titulo: string | null; tipo: string; status: string; valor_venda: number | null; valor_locacao: number | null; finalidade: string; bairro: string | null }
  const ultimosClientes = (ultimosClientesRaw ?? []) as ClienteRow[]
  const ultimosImoveis = (ultimosImoveisRaw ?? []) as ImovelRow[]

  const primeiroNome = (usuario?.nome ?? '').split(' ')[0] || 'corretor'
  const recentes = leads.slice(0, 6)

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Início" />

      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4 sm:px-6 sm:py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1100px] space-y-4">

          {/* Header */}
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Olá, {primeiroNome}.</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">Aqui está {isGestor ? 'a operação da equipe' : 'sua operação'} hoje.</p>
          </div>

          {/* Funil — uma caixa por etapa, na ordem em que o negócio anda.
              Os indicadores que existiam aqui em cima (leads novos, visitas
              agendadas, em proposta) eram as próprias etapas repetidas; do
              conjunto antigo só o TOTAL não estava no funil, e ele virou o
              subtítulo deste card. */}
          <Card
            title={
              <span className="flex items-baseline gap-2">
                <span>Funil {isGestor ? 'da equipe' : 'de vendas'}</span>
                <span className="num text-[12px] font-normal text-ink-3">
                  {totalLeadsCarteira ?? leads.length} {(totalLeadsCarteira ?? leads.length) === 1 ? 'lead ativo' : 'leads ativos'}
                </span>
              </span>
            }
            actions={<Link href="/leads" className="text-[12px] font-semibold text-accent hover:underline">Abrir Leads →</Link>}
          >
            {/* O recorte cortou: diz na cara, em vez de deixar a soma encolher calada. */}
            {(totalLeadsCarteira ?? 0) > leads.length && (
              <p className="mb-3 rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] leading-snug text-ink-2">
                Os números abaixo e o termômetro contam os <strong className="num">{leads.length}</strong> leads
                de contato mais recente, de <strong className="num">{totalLeadsCarteira}</strong> ativos.
                Abra <Link href="/leads" className="font-semibold text-accent hover:underline">Leads</Link> para a carteira inteira.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {colunas.map(c => (
                <Link
                  key={c.id}
                  href="/leads"
                  className="rounded-control border border-line-soft p-2.5 text-center transition-colors hover:border-ink/20"
                  style={{ borderTopColor: c.color, borderTopWidth: 2 }}
                >
                  <div className="num text-[20px] font-bold leading-none text-ink">{porEtapa(c.id)}</div>
                  <div className="mt-1 truncate text-[10.5px] leading-tight text-ink-3" title={c.label}>{c.label}</div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Temperatura da carteira — quem está pronto para receber ligação hoje */}
          <TermometroLeads leads={leads} config={scoreCfg} />

          {/* Cockpit do dia: próximos compromissos + follow-ups pendentes */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="Próximos compromissos"
              actions={<Link href="/agenda" className="text-[12px] font-semibold text-accent hover:underline">Agenda →</Link>}
            >
              {proximos.length === 0 ? (
                <p className="text-[13px] text-ink-3">Nada marcado para os próximos {DIAS_AGENDA} dias.</p>
              ) : (
                <div>
                  {proximos.map(v => (
                    <div key={v.id} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
                      <span className="w-[58px] flex-none">
                        <span className="num block text-[13px] font-semibold leading-tight text-ink">{hora(v.data_hora)}</span>
                        <span className="num block text-[10.5px] leading-tight text-ink-3">{diaMes(v.data_hora)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{v.lead_nome || 'Visita'}</span>
                        {v.imovel && <span className="block truncate text-[11px] text-ink-3">{v.imovel}</span>}
                      </span>
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

          <LeadsParados leads={parados} limiteDias={DIAS_PARADO} />

          {/* Atalhos de acervo e carteira */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/imoveis" className="flex items-center gap-3 rounded-card border border-line bg-card p-4 transition-colors hover:border-ink/20">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent"><Home size={19} strokeWidth={1.7} /></span>
              <div className="flex-1">
                <div className="num text-[20px] font-bold leading-none text-ink">{imoveisDisp ?? 0}</div>
                <div className="mt-1 text-[11px] text-ink-3">imóveis disponíveis · {imoveisTotal ?? 0} no acervo</div>
              </div>
              <ArrowUpRight size={18} strokeWidth={1.7} className="text-ink-3" />
            </Link>

            <Link href="/clientes" className="flex items-center gap-3 rounded-card border border-line bg-card p-4 transition-colors hover:border-ink/20">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent"><Users size={19} strokeWidth={1.7} /></span>
              <div className="flex-1">
                <div className="num text-[20px] font-bold leading-none text-ink">{totalClientes ?? 0}</div>
                <div className="mt-1 text-[11px] text-ink-3">clientes na carteira</div>
              </div>
              <ArrowUpRight size={18} strokeWidth={1.7} className="text-ink-3" />
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Últimos leads" actions={<Link href="/leads" className="text-[12px] font-semibold text-accent hover:underline">Ver todos →</Link>}>
              {recentes.length === 0 ? (
                <p className="text-[13px] text-ink-3">Nenhum lead ainda.</p>
              ) : (
                <div>
                  {recentes.map(l => {
                    const col = colunas.find(c => c.id === (l.kanban_status ?? 'novo'))
                    return (
                      <Link key={l.id} href="/leads" className="flex items-center gap-2.5 border-b border-line-soft py-2.5 transition-colors last:border-0 hover:bg-raised">
                        <span className="flex-1 truncate text-[13px] font-medium text-ink">{l.nome || 'Lead'}</span>
                        {l.origem && <span className="shrink-0 text-[11px] text-ink-3">{l.origem}</span>}
                        <Badge tone={toneEtapa(col)}>{col?.label ?? ''}</Badge>
                      </Link>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card title="Últimos imóveis" actions={<Link href="/imoveis" className="text-[12px] font-semibold text-accent hover:underline">Ver todos →</Link>}>
              {ultimosImoveis.length === 0 ? (
                <p className="text-[13px] text-ink-3">Nenhum imóvel cadastrado.</p>
              ) : (
                <div>
                  {ultimosImoveis.map(i => {
                    // Imóvel de locação mostra o aluguel; os outros, o valor de venda.
                    const valor = i.finalidade === 'locacao' ? i.valor_locacao : (i.valor_venda ?? i.valor_locacao)
                    return (
                      <Link key={i.id} href="/imoveis" className="flex items-center gap-2.5 border-b border-line-soft py-2.5 transition-colors last:border-0 hover:bg-raised">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {[i.codigo, i.titulo || i.tipo].filter(Boolean).join(' · ')}
                          </span>
                          <span className="block truncate text-[11px] text-ink-3">
                            {STATUS_IMOVEL[i.status] ?? i.status}{i.bairro ? ` · ${i.bairro}` : ''}
                          </span>
                        </span>
                        {valor ? <span className="num shrink-0 text-[12px] font-semibold text-ink-2">{brl(Number(valor))}</span> : null}
                      </Link>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Últimos clientes"
            actions={<Link href="/clientes" className="text-[12px] font-semibold text-accent hover:underline">Ver todos →</Link>}
          >
            {ultimosClientes.length === 0 ? (
              <p className="text-[13px] text-ink-3">Nenhum cliente cadastrado.</p>
            ) : (
              <div>
                {ultimosClientes.map(c => (
                  <Link key={c.id} href="/clientes" className="flex items-center gap-2.5 border-b border-line-soft py-2.5 transition-colors last:border-0 hover:bg-raised">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{c.nome}</span>
                      {c.cidade && <span className="block truncate text-[11px] text-ink-3">{c.cidade}</span>}
                    </span>
                    {c.tipo_cliente && <Badge tone="neutro">{c.tipo_cliente}</Badge>}
                    {c.created_at && (
                      <span className="num inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-3">
                        <CalendarDays size={11} strokeWidth={1.7} />{diaMes(c.created_at)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Card>

        </div>
      </main>
    </>
  )
}
