import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { diaNoFuso, instanteLocal, somarDias } from '@/lib/datas'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'
import { DIAS_DO_PERIODO, MEIOS, PERIODOS, montarPainel, pctNoPrazo, type LinhaPainel, type MeioContato, type PeriodoPainel } from '@/lib/posvenda/painel'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Pós-venda · Painel' }

type Embed<T> = T | T[] | null
const um = <T,>(v: Embed<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v)

/**
 * PAINEL DO GESTOR DO PÓS-VENDA (25/11/2026). Só dono, administrador e superadmin. Por pessoa responsável, num período
 * (hoje, 7 ou 30 dias) e numa loja: o que está pendente e atrasado, o que foi feito (e no prazo), perdido, sem resposta,
 * pulado, as notas e os chamados abertos, e por onde os contatos foram feitos (lib/posvenda/painel.ts).
 * Pela sessão: a RLS já deixa dono e administrador lerem a equipe inteira.
 */
export default async function PainelPosVendaPage({ searchParams }: { searchParams: Promise<{ periodo?: string; loja?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')
  const service = createServiceClient()
  const [ligado, { data: vinc }, { data: eu }, fuso, sp] = await Promise.all([
    posvendaLigado(service, empresaId),
    service.from('empresa_usuarios').select('role').eq('empresa_id', empresaId).eq('usuario_id', user.id).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin, filial_atual_id').eq('id', user.id).maybeSingle(),
    fusoDaEmpresa(supabase, empresaId),
    searchParams,
  ])
  if (!ligado) redirect('/pos-venda')
  const gestor = !!eu?.is_super_admin || ['owner', 'admin'].includes(vinc?.role ?? '')
  if (!gestor) redirect('/pos-venda')

  const periodo: PeriodoPainel = sp.periodo === 'hoje' || sp.periodo === '30' ? sp.periodo : '7'
  const hoje = diaNoFuso(new Date(), fuso)
  const inicioDia = somarDias(hoje, -(DIAS_DO_PERIODO[periodo] - 1))
  const inicio = instanteLocal(inicioDia, '00:00', fuso).toISOString()
  // perdidos: a data da perda é estimada pelo dia previsto + tolerância; buscar previstos de até um ano antes
  const inicioPerdidos = instanteLocal(somarDias(inicioDia, -400), '00:00', fuso).toISOString()
  // pendentes: só os previstos até hoje (os futuros não entram em nenhum número do painel)
  const amanha = instanteLocal(somarDias(hoje, 1), '00:00', fuso).toISOString()
  const s = semTipo(supabase)
  const [passos, { data: notas }, { data: chamados }, { data: equipe }, { data: lojas }] = await Promise.all([
    // em páginas de 1000 (o teto de linhas por resposta da API), na ordem do id
    (async () => {
      const fora: unknown[] = []
      for (let de = 0; de < 50000; de += 1000) {
        const { data, error } = await s.from('posvenda_acompanhamentos')
          .select('id, responsavel_id, filial_id, status, previsto_para, feito_em, resultado, motivo, passo:posvenda_cadencia_passos!passo_id(tolerancia_dias)')
          .eq('empresa_id', empresaId)
          .or(`and(status.eq.pendente,previsto_para.lt.${amanha}),feito_em.gte.${inicio},and(status.eq.perdido,previsto_para.gte.${inicioPerdidos})`)
          .order('id').range(de, de + 999)
        if (error || !data) break
        fora.push(...data)
        if (data.length < 1000) break
      }
      return fora
    })(),
    s.from('posvenda_respostas').select('vendedor_id, nota, respondida_em, canal, acompanhamento_id, filial_id')
      .eq('empresa_id', empresaId).gte('respondida_em', inicio).limit(5000),
    s.from('posvenda_chamados').select('filial_id, negocio:negocios!negocio_id(responsavel_id)')
      .eq('empresa_id', empresaId).is('resolvido_em', null).limit(5000),
    service.from('empresa_usuarios').select('usuario_id, role, usuarios(nome)').eq('empresa_id', empresaId).eq('ativo', true).eq('conta_servico', false),
    service.from('filiais').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('id'),
  ])
  // O seletor de loja do topo vale aqui também (a RLS já recorta por ele): com uma loja escolhida lá, o painel é dessa loja.
  const lojaDoTopo = (eu as { filial_atual_id?: number | null } | null)?.filial_atual_id ?? null
  const nomeLojaDoTopo = lojaDoTopo != null ? (lojas ?? []).find((l) => l.id === lojaDoTopo)?.nome ?? null : null
  const loja = nomeLojaDoTopo ? lojaDoTopo : sp.loja && (lojas ?? []).some((l) => String(l.id) === sp.loja) ? Number(sp.loja) : null

  type Membro = { usuario_id: string; role: string; usuarios: Embed<{ nome: string | null }> }
  const membros = (equipe ?? []) as unknown as Membro[]
  const nomes = new Map(membros.map((m) => [m.usuario_id, um(m.usuarios)?.nome?.trim() || 'Sem nome']))
  const linhasBrutas = (passos as unknown as { id: number; responsavel_id: string; filial_id: number | null; status: string; previsto_para: string
    feito_em: string | null; resultado: string | null; motivo: string | null; passo: Embed<{ tolerancia_dias: number | null }> }[])
  // pessoas fora da equipe ativa (saíram) ainda aparecem se têm passos
  const faltam = [...new Set(linhasBrutas.map((p) => p.responsavel_id))].filter((id) => !nomes.has(id))
  if (faltam.length) {
    const { data: us } = await service.from('usuarios').select('id, nome').in('id', faltam)
    for (const u of (us ?? []) as { id: string; nome: string | null }[]) nomes.set(u.id, `${u.nome?.trim() || 'Sem nome'} (fora da equipe)`)
  }

  const { linhas, total } = montarPainel({
    passos: linhasBrutas.map((p) => ({ ...p, tolerancia_dias: um(p.passo)?.tolerancia_dias ?? 7 })),
    notas: (notas ?? []) as { vendedor_id: string | null; nota: number; respondida_em: string; canal: string | null; acompanhamento_id: number | null; filial_id: number | null }[],
    chamados: ((chamados ?? []) as unknown as { filial_id: number | null; negocio: Embed<{ responsavel_id: string | null }> }[])
      .map((c) => ({ filial_id: c.filial_id, responsavel_negocio: um(c.negocio)?.responsavel_id ?? null })),
    pessoas: membros.filter((m) => m.role === 'vendedor').map((m) => m.usuario_id),
  }, { periodo, hoje, fuso, loja })

  const filtro = (p: { periodo?: string; loja?: string | null }) => {
    const q = new URLSearchParams()
    const per = p.periodo ?? periodo
    if (per !== '7') q.set('periodo', per)
    const lj = p.loja === undefined ? (loja != null ? String(loja) : null) : p.loja
    if (lj) q.set('loja', lj)
    const t = q.toString()
    return `/pos-venda/painel${t ? `?${t}` : ''}`
  }
  const chip = (ativo: boolean) => cn('rounded-[6px] px-2.5 py-1 text-[12px] font-medium', ativo ? 'bg-ink text-white' : 'text-ink-2')

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Pós-venda" />
      <div className="mx-auto w-full max-w-[880px] min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 sm:px-4 scrollbar-thin">
        <div className="mb-3 flex gap-1 rounded-control border border-line bg-card p-0.5 text-[12.5px]">
          <Link href="/pos-venda?ver=todos" className="flex-1 rounded-[6px] px-2.5 py-1.5 text-center font-medium text-ink-2">Fila</Link>
          <Link href="/pos-venda/chamados" className="flex-1 rounded-[6px] px-2.5 py-1.5 text-center font-medium text-ink-2">Chamados</Link>
          <span className="flex-1 rounded-[6px] bg-ink px-2.5 py-1.5 text-center font-medium text-white">Painel</span>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-control border border-line bg-card p-0.5">
            {(Object.keys(PERIODOS) as PeriodoPainel[]).map((p) => <Link key={p} href={filtro({ periodo: p })} className={chip(periodo === p)} replace>{PERIODOS[p]}</Link>)}
          </div>
          {nomeLojaDoTopo ? (
            <span className="text-[12px] text-ink-3">Loja: <strong className="text-ink-2">{nomeLojaDoTopo}</strong> (escolhida no seletor de loja do topo; para ver a rede inteira, escolha todas as lojas lá)</span>
          ) : (lojas ?? []).length > 1 && (
            <div className="flex rounded-control border border-line bg-card p-0.5">
              <Link href={filtro({ loja: null })} className={chip(loja == null)} replace>Todas as lojas</Link>
              {(lojas ?? []).map((l) => <Link key={l.id} href={filtro({ loja: String(l.id) })} className={chip(loja === l.id)} replace>{l.nome}</Link>)}
            </div>
          )}
        </div>

        {/* Resumo da equipe */}
        <section className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero rotulo="Pendentes até hoje" valor={total.pendentes} />
          <Numero rotulo="Atrasados" valor={total.atrasados} tom={total.atrasados > 0 ? 'bad' : undefined} />
          <Numero rotulo={`Feitos · ${PERIODOS[periodo].toLowerCase()}`} valor={total.feitos} extra={pctNoPrazo(total) != null ? `${pctNoPrazo(total)}% no prazo` : undefined} />
          <Numero rotulo="Nota média" valor={total.mediaNota ?? '—'} extra={total.notas ? `${total.notas} ${total.notas === 1 ? 'nota' : 'notas'}` : 'nenhuma nota'} />
        </section>
        <section className="mb-4 rounded-card border border-line bg-card px-3.5 py-3">
          <div className="mb-1.5 text-[12px] font-medium text-ink-2">Por onde os passos feitos foram</div>
          <Meios porMeio={total.porMeio} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
            <span>Perdidos por atraso: <span className="num text-ink-2">{total.perdidos}</span></span>
            <span>Sem resposta: <span className="num text-ink-2">{total.semResposta}</span></span>
            <span>Pulados: <span className="num text-ink-2">{total.pulados}</span></span>
            <span>Chamados abertos: <span className="num text-ink-2">{total.chamadosAbertos}</span></span>
          </div>
        </section>

        {/* Por pessoa: quem tem atrasados primeiro */}
        <ul className="flex flex-col gap-2">
          {linhas.map((l) => <CartaoPessoa key={l.pessoa} l={l} nome={nomes.get(l.pessoa) ?? 'Sem nome'} />)}
          {linhas.length === 0 && <li className="pt-6 text-center text-[13px] text-ink-3">Nenhum passo no período.</li>}
        </ul>
        <p className="mt-4 text-[11.5px] text-ink-3">
          Pendentes e atrasados são de agora; o resto conta o período escolhido. Perdido por atraso: passou da tolerância do passo (a data é estimada pelo
          dia previsto mais a tolerância). O meio vem do botão usado na fila (app da loja, ligar, Nexus); “sem registro” quando a pessoa marcou feito sem usar um deles.
        </p>
      </div>
    </div>
  )
}

function Numero({ rotulo, valor, extra, tom }: { rotulo: string; valor: number | string; extra?: string; tom?: 'bad' }) {
  return (
    <div className="rounded-card border border-line bg-card px-3.5 py-2.5">
      <div className="text-[11.5px] text-ink-3">{rotulo}</div>
      <div className={cn('num text-[20px] font-semibold', tom === 'bad' ? 'text-bad' : 'text-ink')}>{valor}</div>
      {extra && <div className="text-[11.5px] text-ink-3">{extra}</div>}
    </div>
  )
}

function Meios({ porMeio }: { porMeio: Record<MeioContato, number> }) {
  const total = Object.values(porMeio).reduce((a, b) => a + b, 0)
  if (!total) return <div className="text-[12px] text-ink-3">Nenhum passo feito no período.</div>
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(MEIOS) as MeioContato[]).filter((m) => porMeio[m] > 0).map((m) => (
        <Badge key={m} tone={m === 'sem_registro' ? 'neutro' : 'acc'}>{MEIOS[m]} {porMeio[m]}</Badge>
      ))}
    </div>
  )
}

function CartaoPessoa({ l, nome }: { l: LinhaPainel; nome: string }) {
  const pct = pctNoPrazo(l)
  return (
    <li className={cn('rounded-card border bg-card px-3.5 py-3', l.atrasados > 0 ? 'border-bad/40' : 'border-line')} data-pessoa={l.pessoa}>
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/pos-venda?ver=todos&pessoa=${l.pessoa}`} className="min-w-0 truncate text-[14.5px] font-semibold text-ink underline-offset-2 hover:underline">{nome}</Link>
        {l.atrasados > 0
          ? <Badge tone="bad" className="shrink-0"><AlertTriangle size={11} strokeWidth={2} className="mr-1 inline" />{l.atrasados} {l.atrasados === 1 ? 'atrasado' : 'atrasados'}</Badge>
          : <Badge tone="ok" className="shrink-0">em dia</Badge>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[12px] sm:grid-cols-6">
        <Metrica rotulo="Pendentes" valor={l.pendentes} />
        <Metrica rotulo="Feitos" valor={l.feitos} extra={pct != null ? `${pct}% no prazo` : undefined} />
        <Metrica rotulo="Perdidos" valor={l.perdidos} />
        <Metrica rotulo="Sem resposta" valor={l.semResposta} />
        <Metrica rotulo="Pulados" valor={l.pulados} />
        <Metrica rotulo="Nota" valor={l.mediaNota ?? '—'} extra={l.notas ? `${l.notas} ${l.notas === 1 ? 'nota' : 'notas'}` : undefined} />
      </div>
      {(l.chamadosAbertos > 0 || l.motivosPulo.length > 0 || l.feitos > 0) && (
        <div className="mt-2 flex flex-col gap-1 border-t border-line-soft pt-2 text-[12px] text-ink-3">
          {l.feitos > 0 && <Meios porMeio={l.porMeio} />}
          {l.chamadosAbertos > 0 && <span>{l.chamadosAbertos} {l.chamadosAbertos === 1 ? 'chamado aberto' : 'chamados abertos'} de clientes desta pessoa</span>}
          {l.motivosPulo.length > 0 && <span>Pulou por: {l.motivosPulo.map((m) => `${m.motivo} (${m.n})`).join(', ')}</span>}
        </div>
      )}
    </li>
  )
}

function Metrica({ rotulo, valor, extra }: { rotulo: string; valor: number | string; extra?: string }) {
  return (
    <div>
      <div className="text-ink-3">{rotulo}</div>
      <div className="num font-semibold text-ink">{valor}</div>
      {extra && <div className="text-[11px] text-ink-3">{extra}</div>}
    </div>
  )
}
