import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { calcularScore, mergeScoreConfig, type LeadScoreInput, type ScoreConfig } from '@/lib/lead-score'
import { Topbar } from '@/components/layout/topbar'
import { Card, Badge } from '@/components/ui'
import { TrendingUp, Home, Users, Flame, Target, MapPin } from 'lucide-react'

export const metadata = { title: 'Executivo' }

/**
 * Painel da diretoria da imobiliária.
 *
 * POR QUE EXISTE SEPARADO do dashboard: o dashboard é do corretor — meus leads,
 * minhas visitas, meu funil. Este é a pergunta do dono: quanto entrou de venda e
 * quanto de locação, quanto ainda deve entrar, quem está produzindo, de onde vêm os
 * leads que fecham e quais imóveis o mercado procura.
 *
 * Só dono e admin (`requireEmpresaRole`), e só no segmento que declara a capacidade
 * — a rota também é filtrada pelo `modulos_habilitados` no middleware.
 *
 * ALTERNADOR por querystring, de propósito: `?tipo=venda|locacao` mantém a página
 * inteira no servidor, sem estado de cliente, e o link fica compartilhável — o
 * diretor manda "olha as locações" com a URL.
 */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (v: number) => `${Math.round(v)}%`

type Filtro = 'ambos' | 'venda' | 'locacao'
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'ambos',   label: 'Vendas + Locações' },
  { id: 'venda',   label: 'Vendas' },
  { id: 'locacao', label: 'Locações' },
]

export default async function ExecutivoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle()
  const cfgSeg = SEGMENTOS[normalizarSegmento(empresa?.segmento)]
  // Capacidade, não nome de segmento: outra vertical que tenha negócio fechado por
  // imóvel liga a mesma flag e herda a tela.
  if (!cfgSeg.capacidades.comissaoPorNegocio) redirect('/dashboard')

  const { tipo } = await searchParams
  const filtro: Filtro = tipo === 'venda' || tipo === 'locacao' ? tipo : 'ambos'

  // Mês corrente no fuso LOCAL — mês que vira no dia 1º às 21h de Brasília não é mês.
  const agora = new Date()
  const iniMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)
  const mesLabel = iniMes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  let qNeg = supabase.from('negocios_imobiliarios')
    .select('id, tipo, valor, status, comissao_total, comissao_captador, comissao_vendedor, corretor_id, captador_id, imovel_id, lead_id, created_at')
    .eq('empresa_id', empresaId)
    .neq('status', 'cancelado')
    .gte('created_at', iniMes.toISOString()).lt('created_at', fimMes.toISOString())
  if (filtro !== 'ambos') qNeg = qNeg.eq('tipo', filtro)

  /**
   * Consulta separada, SEM recorte de mês, só para a eficiência por origem.
   *
   * O denominador ali são todos os leads ativos da base — se o numerador olhasse
   * apenas os negócios deste mês, uma origem que fechou em julho apareceria com
   * 0% de aproveitamento, e o dono cortaria justamente a origem que funciona.
   */
  let qFechados = supabase.from('negocios_imobiliarios')
    .select('lead_id').eq('empresa_id', empresaId).neq('status', 'cancelado').not('lead_id', 'is', null)
  if (filtro !== 'ambos') qFechados = qFechados.eq('tipo', filtro)

  const [
    { data: negRaw }, { data: leadsRaw }, { data: etapasRaw }, { data: scoreRow },
    { data: visitasRaw }, { data: membrosRaw }, { data: fechadosRaw },
  ] = await Promise.all([
    qNeg,
    // Pipeline aberto: só o que ainda pode fechar.
    supabase.from('leads')
      .select('id, nome, origem, kanban_status, funil_id, valor_estimado, responsavel_id, ultima_mensagem_at, ultima_tratativa, created_at, msgs_nao_lidas')
      .eq('empresa_id', empresaId).eq('ativo', true).limit(500),
    supabase.from('funil_etapas').select('funil_id, slug, tipo, probabilidade').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle(),
    supabase.from('visitas').select('imovel_id').eq('empresa_id', empresaId).not('imovel_id', 'is', null).limit(1000),
    supabase.from('empresa_usuarios').select('usuario_id').eq('empresa_id', empresaId).eq('ativo', true),
    qFechados,
  ])

  type NegRow = {
    id: number; tipo: string; valor: number; status: string
    comissao_total: number | null; comissao_captador: number | null; comissao_vendedor: number | null
    corretor_id: string | null; captador_id: string | null; imovel_id: number; lead_id: number | null
  }
  const negocios = (negRaw ?? []) as NegRow[]

  // ── Nomes por consulta separada (embed duplo para `usuarios` erra fácil e
  //    esvazia a consulta inteira em silêncio — ver o log de acessos de 12/08).
  const idsUsuarios = [...new Set(((membrosRaw ?? []) as { usuario_id: string }[]).map((m) => m.usuario_id))]
  const idsImoveis = [...new Set([...negocios.map((n) => n.imovel_id),
    ...((visitasRaw ?? []) as { imovel_id: number }[]).map((v) => v.imovel_id)])]
  const [{ data: nomesU }, { data: imoveisN }] = await Promise.all([
    idsUsuarios.length ? supabase.from('usuarios').select('id, nome').in('id', idsUsuarios) : Promise.resolve({ data: [] }),
    idsImoveis.length ? supabase.from('imoveis').select('id, codigo, titulo, bairro, cidade').in('id', idsImoveis) : Promise.resolve({ data: [] }),
  ])
  const nomeUsuario = new Map(((nomesU ?? []) as { id: string; nome: string | null }[]).map((u) => [u.id, u.nome ?? '—']))
  const imovelInfo = new Map(((imoveisN ?? []) as { id: number; codigo: string | null; titulo: string | null; bairro: string | null; cidade: string | null }[])
    .map((i) => [i.id, { nome: i.codigo || i.titulo || `#${i.id}`, onde: [i.bairro, i.cidade].filter(Boolean).join(', ') }]))

  // ── 1. Fechado no mês ──
  const fechado = {
    qtd: negocios.length,
    valor: negocios.reduce((s, n) => s + Number(n.valor || 0), 0),
    comissao: negocios.reduce((s, n) => s + Number(n.comissao_total || 0), 0),
    venda: negocios.filter((n) => n.tipo === 'venda'),
    locacao: negocios.filter((n) => n.tipo === 'locacao'),
  }

  // ── 2. Previsão de fechamento: pipeline aberto ponderado pela etapa ──
  type EtapaRow = { funil_id: number | null; slug: string; tipo: string; probabilidade: number }
  const etapas = (etapasRaw ?? []) as EtapaRow[]
  const probPorEtapa = new Map(etapas.map((e) => [`${e.funil_id}:${e.slug}`, e]))
  const terminais = new Set(etapas.filter((e) => e.tipo === 'ganho' || e.tipo === 'perdido').map((e) => e.slug))

  type LeadRow = {
    id: number; nome: string | null; origem: string | null; kanban_status: string | null
    funil_id: number | null; valor_estimado: number | null; responsavel_id: string | null
    ultima_mensagem_at: string | null; ultima_tratativa: string | null; created_at: string | null
    msgs_nao_lidas: number | null
  }
  const leads = (leadsRaw ?? []) as LeadRow[]
  const abertos = leads.filter((l) => !terminais.has(l.kanban_status ?? 'novo'))

  /**
   * A previsão soma valor estimado × probabilidade da etapa.
   *
   * Lead sem valor estimado entra com ZERO e é contado à parte: fingir uma média
   * inflaria a previsão com número inventado, e previsão inflada faz o dono
   * contratar em cima de dinheiro que não existe.
   */
  let previsao = 0
  let semValor = 0
  for (const l of abertos) {
    const et = probPorEtapa.get(`${l.funil_id}:${l.kanban_status ?? 'novo'}`)
    const valor = Number(l.valor_estimado || 0)
    if (valor <= 0) { semValor += 1; continue }
    previsao += valor * ((et?.probabilidade ?? 25) / 100)
  }

  // ── 3. Produção por corretor no mês ──
  /**
   * Cada pessoa aparece pelo que produziu E pelo que tem a receber.
   *
   * Uma pessoa pode ter captado e vendido o MESMO imóvel — nesse caso o negócio
   * conta uma vez na contagem (por isso o Set de ids) e as duas partes da comissão
   * somam para ela, que é exatamente o que ela vai receber.
   */
  const porCorretor = new Map<string, { valor: number; negocios: Set<number>; receber: number }>()
  for (const n of negocios) {
    for (const [papel, id] of [['vendedor', n.corretor_id], ['captador', n.captador_id]] as const) {
      if (!id) continue
      const atual = porCorretor.get(id) ?? { valor: 0, negocios: new Set<number>(), receber: 0 }
      // Valor do negócio entra uma vez por pessoa, não uma vez por papel.
      if (!atual.negocios.has(n.id)) { atual.valor += Number(n.valor || 0); atual.negocios.add(n.id) }
      atual.receber += Number((papel === 'vendedor' ? n.comissao_vendedor : n.comissao_captador) || 0)
      porCorretor.set(id, atual)
    }
  }
  const topCorretores = [...porCorretor.entries()]
    .map(([id, v]) => ({ nome: nomeUsuario.get(id) ?? '—', valor: v.valor, qtd: v.negocios.size, receber: v.receber }))
    .sort((a, b) => b.valor - a.valor).slice(0, 6)

  // ── 4. Leads quentes no pipeline ──
  const scoreCfg = mergeScoreConfig((scoreRow?.valor ?? null) as Partial<ScoreConfig> | null)
  const quentes = abertos
    .map((l) => ({ lead: l, ...calcularScore(l as unknown as LeadScoreInput, scoreCfg) }))
    .filter((x) => x.tier === 'quente')
    .sort((a, b) => b.score - a.score).slice(0, 6)

  // ── 5. Origem de leads — eficiência (quantos viraram negócio) ──
  const leadsComNegocio = new Set(((fechadosRaw ?? []) as { lead_id: number | null }[])
    .map((n) => n.lead_id).filter((x): x is number => x != null))
  const porOrigem = new Map<string, { total: number; fechou: number }>()
  for (const l of leads) {
    const o = l.origem || 'não informada'
    const atual = porOrigem.get(o) ?? { total: 0, fechou: 0 }
    atual.total += 1
    if (leadsComNegocio.has(l.id)) atual.fechou += 1
    porOrigem.set(o, atual)
  }
  const origens = [...porOrigem.entries()]
    .map(([origem, v]) => ({ origem, ...v, taxa: v.total > 0 ? (v.fechou / v.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total).slice(0, 6)

  // ── 6. Imóveis mais procurados (por visita agendada) ──
  const porImovel = new Map<number, number>()
  for (const v of ((visitasRaw ?? []) as { imovel_id: number }[])) {
    porImovel.set(v.imovel_id, (porImovel.get(v.imovel_id) ?? 0) + 1)
  }
  const procurados = [...porImovel.entries()]
    .map(([id, visitas]) => ({ ...(imovelInfo.get(id) ?? { nome: `#${id}`, onde: '' }), visitas }))
    .sort((a, b) => b.visitas - a.visitas).slice(0, 6)

  return (
    <>
      <Topbar title="Painel executivo" />

      {/* <div> e nao <main>: o layout do dashboard ja abre um <main>, e aninhar
          dois e invalido. As telas antigas fazem isso; a nova nao repete. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4 sm:px-6 sm:py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1100px] space-y-4">

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Visão da diretoria</h1>
              <p className="mt-0.5 text-[13px] text-ink-2">
                Fechamento de <span className="first-letter:uppercase">{mesLabel}</span> · pipeline e procura na situação de agora
              </p>
            </div>
            {/* Alternador: link, não botão — a URL fica compartilhável. */}
            <div className="flex gap-1 rounded-control border border-line bg-card p-1">
              {FILTROS.map((f) => (
                <Link
                  key={f.id}
                  href={f.id === 'ambos' ? '/executivo' : `/executivo?tipo=${f.id}`}
                  className={`rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    filtro === f.id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-bg'
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Fechado no mês */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Numero titulo="Fechado no mês" valor={brl(fechado.valor)} rodape={`${fechado.qtd} ${fechado.qtd === 1 ? 'negócio' : 'negócios'}`} destaque />
            <Numero titulo="Comissão gerada" valor={brl(fechado.comissao)} rodape="soma dos negócios do mês" />
            {/*
              Com filtro ativo, mostrar "Locações: 0" ao lado de "Vendas" faria o
              recorte parecer resultado. Os dois cards de quebra só existem na
              visão conjunta; filtrado, o espaço vira ticket e comissão média.
            */}
            {filtro === 'ambos' ? (
              <>
                <Numero titulo="Vendas" valor={String(fechado.venda.length)} rodape={brl(fechado.venda.reduce((s, n) => s + Number(n.valor || 0), 0))} />
                <Numero titulo="Locações" valor={String(fechado.locacao.length)} rodape={brl(fechado.locacao.reduce((s, n) => s + Number(n.valor || 0), 0))} />
              </>
            ) : (
              <>
                <Numero titulo="Ticket médio" valor={fechado.qtd > 0 ? brl(fechado.valor / fechado.qtd) : '—'} rodape={filtro === 'venda' ? 'por venda' : 'por locação'} />
                <Numero titulo="Comissão média" valor={fechado.valor > 0 ? pct((fechado.comissao / fechado.valor) * 100) : '—'} rodape="sobre o valor fechado" />
              </>
            )}
          </div>

          {/* Previsão */}
          <Card title={<span className="inline-flex items-center gap-2"><TrendingUp size={15} strokeWidth={1.8} className="text-accent" />Previsão de fechamento</span>}>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <div className="num text-[26px] font-bold tracking-[-0.03em] text-ink">{brl(previsao)}</div>
                <div className="text-[12px] text-ink-3">
                  {abertos.length} {abertos.length === 1 ? 'lead aberto' : 'leads abertos'}, ponderados pela etapa
                  {/*
                    O filtro de cima NÃO recorta esta conta, e dizer isso importa: o
                    lead não registra se vai virar venda ou locação, então filtrar
                    aqui seria inventar a divisão. Número que parece filtrado sem
                    estar é pior que número sem filtro.
                  */}
                  {filtro !== 'ambos' && ' · inclui venda e locação (o lead não separa)'}
                </div>
              </div>
              {semValor > 0 && (
                <p className="max-w-[46ch] rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] leading-snug text-ink-2">
                  <strong className="num">{semValor}</strong> {semValor === 1 ? 'lead aberto está' : 'leads abertos estão'} sem
                  valor estimado e {semValor === 1 ? 'ficou' : 'ficaram'} fora desta conta. A previsão é
                  o piso, não o teto — preencher o valor no lead melhora o número.
                </p>
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top corretores */}
            <Card title={<span className="inline-flex items-center gap-2"><Users size={15} strokeWidth={1.8} className="text-accent" />Produção por corretor</span>} flush>
              {topCorretores.length === 0
                ? <Vazio texto="Nenhum negócio fechado neste mês." />
                : (
                  <div className="divide-y divide-line-soft">
                    {topCorretores.map((c, i) => (
                      <div key={c.nome + i} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="num w-5 shrink-0 text-[12px] font-bold text-ink-3">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{c.nome}</span>
                          <span className="num block text-[11.5px] text-ink-3">
                            {c.qtd} {c.qtd === 1 ? 'negócio' : 'negócios'} · {brl(c.receber)} a receber
                          </span>
                        </span>
                        <span className="num w-[110px] shrink-0 text-right text-[13px] font-semibold text-ink">{brl(c.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
            </Card>

            {/* Leads quentes */}
            <Card title={<span className="inline-flex items-center gap-2"><Flame size={15} strokeWidth={1.8} className="text-bad" />Leads quentes no pipeline</span>} flush>
              {quentes.length === 0
                ? <Vazio texto="Nenhum lead na faixa quente agora." />
                : (
                  <div className="divide-y divide-line-soft">
                    {quentes.map((q) => (
                      <Link key={q.lead.id} href="/leads" className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{q.lead.nome || 'Lead sem nome'}</span>
                        <span className="truncate text-[11.5px] text-ink-3">{q.lead.responsavel_id ? nomeUsuario.get(q.lead.responsavel_id) ?? '—' : 'sem dono'}</span>
                        <Badge tone="bad">{q.score}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
            </Card>

            {/* Origem × eficiência */}
            <Card
              title={<span className="inline-flex items-center gap-2"><Target size={15} strokeWidth={1.8} className="text-accent" />Origem dos leads e eficiência</span>}
              actions={<span className="text-[11px] text-ink-3">aproveitamento de todo o histórico</span>}
              flush
            >
              {origens.length === 0
                ? <Vazio texto="Nenhum lead cadastrado ainda." />
                : (
                  <div className="divide-y divide-line-soft">
                    {origens.map((o) => (
                      <div key={o.origem} className="px-4 py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13px] font-medium capitalize text-ink">{o.origem}</span>
                          <span className="num shrink-0 text-[12px] text-ink-3">
                            {o.fechou}/{o.total} · {pct(o.taxa)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-soft">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, o.taxa)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>

            {/* Imóveis mais procurados */}
            <Card title={<span className="inline-flex items-center gap-2"><Home size={15} strokeWidth={1.8} className="text-accent" />Imóveis mais procurados</span>} flush>
              {procurados.length === 0
                ? <Vazio texto="Nenhuma visita agendada ainda — é a visita que mede procura." />
                : (
                  <div className="divide-y divide-line-soft">
                    {procurados.map((p, i) => (
                      <div key={p.nome + i} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{p.nome}</span>
                          {p.onde && (
                            <span className="flex items-center gap-1 truncate text-[11.5px] text-ink-3">
                              <MapPin size={11} strokeWidth={1.8} />{p.onde}
                            </span>
                          )}
                        </span>
                        <span className="num shrink-0 text-[12px] text-ink-2">{p.visitas} {p.visitas === 1 ? 'visita' : 'visitas'}</span>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}

function Numero({ titulo, valor, rodape, destaque = false }: { titulo: string; valor: string; rodape?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-card border bg-card p-3 ${destaque ? 'border-ink/20' : 'border-line'}`}>
      <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">{titulo}</div>
      <div className="num mt-1 text-[20px] font-bold tracking-[-0.02em] text-ink">{valor}</div>
      {rodape && <div className="num mt-0.5 text-[11.5px] text-ink-3">{rodape}</div>}
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">{texto}</p>
}
