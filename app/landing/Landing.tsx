'use client'

/**
 * Landing — homepage pública do Nexus, sistema visual "Precisão".
 *
 * Estrutura (acima da dobra): nav fixa, hero, seletor de segmento ao vivo
 * que troca a captura de tela do produto. Abaixo do hero: <Sections/>.
 *
 * Cores: apenas tokens Precisão (bg/card/raised, ink, line, accent, ok/warn/bad).
 * Hex inline é usado SOMENTE nos pontos data-driven do mock (cor do dot do funil),
 * como no mock aprovado. Movimento sutil: entrada do hero via GSAP, respeitando
 * prefers-reduced-motion; rolagem suave via Lenis.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { gsap } from 'gsap'
import { useSmoothScroll } from './hooks/useSmoothScroll'
import Sections, { type PlanData } from './Sections'

/* ------------------------------------------------------------------ */
/*  Dados dos segmentos — alimentam o mock da captura de tela          */
/* ------------------------------------------------------------------ */

type Tone = 'ok' | 'warn' | 'ink3'
type FunilCol = { name: string; dot: string; leads: [string, string][] }
type Segment = {
  label: string
  empresa: string
  inicial: string
  nav: [string, string, string] // PDV/Estoque/Clientes equivalentes
  url: string
  k1: { label: string; value: string; sub: string; tone: Tone }
  k2: { value: string; sub: string }
  k3: { label: string; value: string; sub: string; tone: Tone }
  funil: string
  cols: FunilCol[]
}

const SEGS: Record<string, Segment> = {
  varejo: {
    label: 'Varejo', empresa: 'JM Store', inicial: 'J', nav: ['PDV', 'Estoque', 'Clientes'],
    url: 'app.usenexus.com.br/dashboard',
    k1: { label: 'Vendas hoje', value: 'R$ 8.420', sub: '+12,4% vs ontem', tone: 'ok' },
    k2: { value: '14', sub: '6 aguardando resposta' },
    k3: { label: 'Tarefas hoje', value: '9', sub: '2 vencem às 18h', tone: 'warn' },
    funil: 'Funil de vendas — julho',
    cols: [
      { name: 'Novo', dot: '#9199A3', leads: [['Larissa M.', 'iPhone 15 · Instagram'], ['Cauã R.', 'Fone JBL · balcão']] },
      { name: 'Em contato', dot: '#5C6470', leads: [['Douglas P.', 'Xiaomi 13 · WhatsApp']] },
      { name: 'Negociação', dot: '#2E5CE6', leads: [['Vanessa T.', 'MacBook · R$ 7,9 mil']] },
      { name: 'Fechamento', dot: '#B45309', leads: [['Igor S.', 'S24 · Pix enviado']] },
      { name: 'Convertido', dot: '#188A54', leads: [['Ana Paula', 'iPhone 13 · R$ 3.450']] },
    ],
  },
  imob: {
    label: 'Imobiliária', empresa: 'Horizonte Imóveis', inicial: 'H', nav: ['Imóveis', 'Agenda', 'Proprietários'],
    url: 'app.usenexus.com.br/imoveis',
    k1: { label: 'Visitas hoje', value: '6', sub: '2 confirmadas p/ manhã', tone: 'ok' },
    k2: { value: '11', sub: '4 vindos do portal' },
    k3: { label: 'Propostas ativas', value: '3', sub: 'R$ 1,2 mi em negociação', tone: 'ink3' },
    funil: 'Funil de vendas — imóveis',
    cols: [
      { name: 'Lead novo', dot: '#9199A3', leads: [['Fam. Andrade', 'Apto 2q · Centro'], ['Bruno L.', 'Casa · até 450 mil']] },
      { name: 'Visita agendada', dot: '#2E5CE6', leads: [['Marta C.', 'qui 10h · Ed. Solar']] },
      { name: 'Visita feita', dot: '#5C6470', leads: [['Paulo H.', 'pediu 2ª visita']] },
      { name: 'Proposta', dot: '#B45309', leads: [['Fam. Nogueira', 'R$ 380 mil']] },
      { name: 'Fechamento', dot: '#188A54', leads: [['Renata V.', 'crédito aprovado']] },
    ],
  },
  auto: {
    label: 'Concessionária', empresa: 'Riviera Motors', inicial: 'R', nav: ['Veículos', 'Pátio', 'Oficina'],
    url: 'app.usenexus.com.br/veiculos',
    k1: { label: 'Test-drives hoje', value: '4', sub: 'Corolla 14h · T-Cross 16h', tone: 'ink3' },
    k2: { value: '17', sub: '9 de portais de veículos' },
    k3: { label: 'Avaliações de usado', value: '2', sub: 'HB20 2021 em análise', tone: 'warn' },
    funil: 'Funil — seminovos',
    cols: [
      { name: 'Novo', dot: '#9199A3', leads: [['Felipe A.', 'Onix 2022 · OLX'], ['Débora S.', 'SUV até 120 mil']] },
      { name: 'Test-drive', dot: '#2E5CE6', leads: [['Marcos V.', 'Compass · sáb 10h']] },
      { name: 'Aval. do usado', dot: '#5C6470', leads: [['Juliana P.', 'troca: Argo 2020']] },
      { name: 'Proposta + F&I', dot: '#B45309', leads: [['Sérgio T.', 'ficha no banco']] },
      { name: 'Fechamento', dot: '#188A54', leads: [['Camila R.', 'Creta faturado']] },
    ],
  },
  saude: {
    label: 'Saúde', empresa: 'Clínica Vitalle', inicial: 'V', nav: ['Agenda', 'Pacientes', 'Procedimentos'],
    url: 'app.usenexus.com.br/agenda',
    k1: { label: 'Consultas hoje', value: '18', sub: 'confirmadas no WhatsApp', tone: 'ok' },
    k2: { value: '7', sub: '3 pediram encaixe' },
    k3: { label: 'Faltas evitadas', value: '5', sub: 'lembrete D-1 automático', tone: 'ok' },
    funil: 'Jornada do paciente',
    cols: [
      { name: 'Novo contato', dot: '#9199A3', leads: [['Beatriz N.', 'avaliação · Instagram']] },
      { name: 'Agendado', dot: '#2E5CE6', leads: [['Sr. Almeida', 'retorno qui 09h'], ['Luana F.', '1ª consulta sex']] },
      { name: 'Em atendimento', dot: '#5C6470', leads: [['Marcela D.', 'sala 2']] },
      { name: 'Retorno', dot: '#B45309', leads: [['João Pedro', '30 dias · fisio']] },
      { name: 'Concluído', dot: '#188A54', leads: [['Rosa M.', 'alta + NPS']] },
    ],
  },
  food: {
    label: 'Food', empresa: 'Trattoria Bene', inicial: 'T', nav: ['Comandas', 'Cardápio', 'Entregas'],
    url: 'app.usenexus.com.br/pedidos',
    k1: { label: 'Pedidos hoje', value: '64', sub: 'ticket médio R$ 62', tone: 'ok' },
    k2: { value: '22', sub: 'delivery via WhatsApp' },
    k3: { label: 'Mesas abertas', value: '8', sub: '2 pedindo a conta', tone: 'warn' },
    funil: 'Fluxo de pedidos — agora',
    cols: [
      { name: 'Recebido', dot: '#9199A3', leads: [['#341 · Larissa', '2 massas · delivery']] },
      { name: 'Na cozinha', dot: '#2E5CE6', leads: [['#339 · mesa 6', 'risoto + vinho'], ['#340 · balcão', 'pizza margherita']] },
      { name: 'Pronto', dot: '#5C6470', leads: [['#338 · mesa 2', 'sobremesas']] },
      { name: 'Em entrega', dot: '#B45309', leads: [['#336 · Léo', 'bairro Sta. Cruz']] },
      { name: 'Entregue', dot: '#188A54', leads: [['#334 · Rodrigo', 'pago no Pix']] },
    ],
  },
  servicos: {
    label: 'Serviços', empresa: 'TechFix Assistência', inicial: 'T', nav: ['Ordens de Serviço', 'Orçamentos', 'Garantias'],
    url: 'app.usenexus.com.br/ordens',
    k1: { label: 'OS abertas', value: '23', sub: '5 aguardando peça', tone: 'warn' },
    k2: { value: '9', sub: '6 pediram orçamento' },
    k3: { label: 'Prontas p/ retirada', value: '7', sub: 'aviso enviado no WhatsApp', tone: 'ok' },
    funil: 'Esteira de ordens de serviço',
    cols: [
      { name: 'Novo', dot: '#9199A3', leads: [['iPhone 12 · Caio', 'tela quebrada']] },
      { name: 'Diagnóstico', dot: '#5C6470', leads: [['Note Dell · Vera', 'não liga']] },
      { name: 'Orçamento', dot: '#2E5CE6', leads: [['S22 · Henrique', 'R$ 480 · aguarda ok']] },
      { name: 'Em reparo', dot: '#B45309', leads: [['Moto G · Paty', 'conector']] },
      { name: 'Entregue', dot: '#188A54', leads: [['iPad · Sr. Luiz', 'garantia 90d']] },
    ],
  },
}

const SEG_KEYS = Object.keys(SEGS)
const toneClass: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', ink3: 'text-ink-3' }

export default function Landing({ plans }: { plans?: PlanData[] }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [seg, setSeg] = useState<string>('varejo')
  const s = SEGS[seg]

  // rolagem suave (Lenis + GSAP), respeita reduced-motion internamente
  useSmoothScroll()

  // entrada do hero — fade-up sutil em stagger
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const els = root.querySelectorAll<HTMLElement>('[data-hero]')
    if (reduce) {
      els.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none' })
      return
    }
    const ctx = gsap.context(() => {
      gsap.from('[data-hero]', {
        y: 16, opacity: 0, duration: 0.9, stagger: 0.09, ease: 'power3.out',
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="min-h-screen bg-bg font-sans text-ink antialiased">
      {/* ---------- 1 · NAV ---------- */}
      <nav className="sticky top-0 z-50 border-b border-line-soft bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-[60px] max-w-[1080px] items-center gap-8 px-6">
          <Link href="/" className="flex items-center" aria-label="Nexus">
            <Image src="/nexus-logo.png" alt="Nexus" width={60} height={51} priority className="h-[44px] w-auto" />
          </Link>
          <div className="ml-2 hidden items-center gap-7 text-[13.5px] font-medium text-ink-2 md:flex">
            <a href="#produto" className="transition-colors hover:text-ink">Produto</a>
            <a href="#segmentos" className="transition-colors hover:text-ink">Segmentos</a>
            <a href="#planos" className="transition-colors hover:text-ink">Planos</a>
          </div>
          <div className="ml-auto flex items-center gap-3.5">
            <Link href="/login" className="hidden items-center gap-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink sm:inline-flex">
              <LogIn size={15} />
              Entrar
            </Link>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-control bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink/90">
              Testar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ---------- 2 · HERO + 3 · SEGMENTO AO VIVO ---------- */}
      <header id="produto" className="mx-auto max-w-[1080px] px-6 pt-[72px]">
        <div data-hero className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
          CRM + operação · feito para o comércio brasileiro
        </div>
        <h1 data-hero className="mt-4 max-w-[760px] text-[clamp(36px,5.4vw,58px)] font-bold leading-[1.03] tracking-[-0.042em]">
          Venda com processo.<br />Cresça com controle.
        </h1>
        <p data-hero className="mb-7 mt-[18px] max-w-[540px] text-[17.5px] leading-relaxed text-ink-2">
          Leads do WhatsApp, vendas com Pix, estoque, agenda e financeiro num sistema só — que fala a língua do seu segmento.
        </p>
        <div data-hero className="flex flex-wrap items-center gap-2.5">
          <Link href="/register" className="inline-flex items-center gap-2 rounded-[9px] bg-ink px-[22px] py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-ink/90">
            Começar grátis por 14 dias
          </Link>
          <a href="#produto" className="inline-flex items-center gap-2 rounded-[9px] border border-line bg-card px-[22px] py-3 text-[14.5px] font-semibold text-ink transition-colors hover:border-ink/20">
            Ver demonstração
          </a>
        </div>
        <div data-hero className="mt-3.5 text-[12.5px] text-ink-3">
          Sem cartão de crédito · migração assistida · <b className="font-semibold text-ink-2">configuração em 10 minutos</b>
        </div>

        {/* seletor de segmento */}
        <div id="segmentos" data-hero className="mb-[18px] mt-[52px] flex scroll-mt-24">
          <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] border border-line-soft bg-ink/[0.05] p-[3px]">
            {SEG_KEYS.map((k) => {
              const on = k === seg
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSeg(k)}
                  aria-pressed={on}
                  className={
                    'rounded-control px-3.5 py-[7px] text-[12.5px] font-semibold transition-colors ' +
                    (on ? 'bg-card text-ink shadow-[0_1px_2px_rgba(21,24,28,.08)]' : 'text-ink-2 hover:text-ink')
                  }
                >
                  {SEGS[k].label}
                </button>
              )
            })}
          </div>
        </div>

        {/* captura de tela do produto */}
        <div data-hero className="pb-[84px]">
          <div className="overflow-hidden rounded-card border border-line bg-card shadow-[0_1px_2px_rgba(21,24,28,.04),0_32px_64px_-32px_rgba(21,24,28,.16)]">
            {/* barra do navegador */}
            <div className="flex h-10 items-center gap-[7px] border-b border-line-soft bg-raised px-3.5">
              <span className="h-[9px] w-[9px] rounded-full bg-ink/[0.08]" />
              <span className="h-[9px] w-[9px] rounded-full bg-ink/[0.08]" />
              <span className="h-[9px] w-[9px] rounded-full bg-ink/[0.08]" />
              <span className="ml-2 text-[11.5px] font-medium text-ink-3">{s.url}</span>
            </div>

            <div className="grid min-h-[400px] grid-cols-1 md:grid-cols-[196px_1fr]">
              {/* sidebar do mock */}
              <div className="hidden border-r border-line-soft bg-raised px-2 py-3.5 md:block">
                <div className="flex items-center gap-2 px-2.5 pb-3.5 pt-1 text-[12.5px] font-bold tracking-[-0.01em]">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-ink text-[10px] font-bold text-white">{s.inicial}</span>
                  {s.empresa}
                </div>
                <MiniGroup>Hoje</MiniGroup>
                <MiniItem active>Dashboard</MiniItem>
                <MiniItem count="9">Tarefas</MiniItem>
                <MiniGroup>Comercial</MiniGroup>
                <MiniItem count="14">Leads</MiniItem>
                <MiniItem>{s.nav[2]}</MiniItem>
                <MiniGroup>Operação</MiniGroup>
                <MiniItem>{s.nav[0]}</MiniItem>
                <MiniItem>{s.nav[1]}</MiniItem>
              </div>

              {/* conteúdo do mock */}
              <div className="bg-bg px-6 py-5">
                <div className="mb-3.5 flex items-baseline justify-between">
                  <span className="text-[17px] font-bold tracking-[-0.025em]">Bom dia, Matheus</span>
                  <span className="text-[11px] font-medium tabular-nums text-ink-3">ter · 08 jul</span>
                </div>

                {/* KPIs */}
                <div className="mb-3.5 grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-card sm:grid-cols-3">
                  <Kpi label={s.k1.label} value={s.k1.value} sub={s.k1.sub} tone={s.k1.tone} />
                  <Kpi label="Leads novos" value={s.k2.value} sub={s.k2.sub} tone="ink3" />
                  <Kpi label={s.k3.label} value={s.k3.value} sub={s.k3.sub} tone={s.k3.tone} lastRow />
                </div>

                {/* funil */}
                <div className="rounded-[10px] border border-line bg-card p-3.5">
                  <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">{s.funil}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {s.cols.map((col, i) => (
                      <div key={col.name} className={i >= 3 ? 'hidden sm:block' : ''}>
                        <div className="mb-[7px] flex items-center gap-[5px] text-[10px] font-semibold text-ink-2">
                          <span className="h-[5px] w-[5px] rounded-[2px]" style={{ background: col.dot }} />
                          {col.name}
                          <span className="ml-auto font-semibold tabular-nums text-ink-3">{col.leads.length}</span>
                        </div>
                        {col.leads.map(([a, b]) => (
                          <div key={a} className="mb-1.5 rounded-[7px] border border-line-soft bg-card px-2 py-1.5 text-[9.5px] font-semibold">
                            {a}
                            <small className="mt-px block text-[8.5px] font-medium text-ink-3">{b}</small>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- 4–11 · demais seções ---------- */}
      <Sections plans={plans} />
    </div>
  )
}

/* --- pequenos blocos do mock da sidebar --- */
function MiniGroup({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-[5px] pt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">{children}</div>
}
function MiniItem({ children, active, count }: { children: ReactNode; active?: boolean; count?: string }) {
  return (
    <div
      className={
        'mb-px flex items-center gap-[9px] rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium ' +
        (active ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2')
      }
    >
      <span className="h-[13px] w-[13px] flex-shrink-0 rounded-[4px] border-[1.4px] border-current opacity-55" />
      {children}
      {count && <span className="ml-auto text-[10px] font-semibold tabular-nums text-ink-3">{count}</span>}
    </div>
  )
}
function Kpi({ label, value, sub, tone, lastRow }: { label: string; value: string; sub: string; tone: Tone; lastRow?: boolean }) {
  return (
    <div className={'border-line-soft px-[15px] py-[13px] [&:not(:last-child)]:border-r ' + (lastRow ? 'col-span-2 sm:col-span-1' : '')}>
      <div className="text-[10.5px] font-medium text-ink-3">{label}</div>
      <div className="mt-[3px] text-[21px] font-bold tracking-[-0.03em] tabular-nums">{value}</div>
      <div className={'mt-px text-[10.5px] font-semibold tabular-nums ' + toneClass[tone]}>{sub}</div>
    </div>
  )
}
