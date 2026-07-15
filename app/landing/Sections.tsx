'use client'

/**
 * Sections — tudo abaixo do hero da landing (sistema "Precisão"):
 * 4· prova social · 5· feature WhatsApp · 6· módulos por segmento ·
 * 7· depoimento · 8· comparativo honesto · 9· planos · 10· FAQ · 11· CTA + footer.
 *
 * Movimento sutil: blocos sobem ao entrar na viewport (ScrollTrigger),
 * grids em stagger. Respeita prefers-reduced-motion. Cores só por tokens.
 */

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  Check, X, ArrowUpRight, Minus, Plus,
  MessageSquare, Workflow, CreditCard, Package, CalendarDays, Wallet,
  BarChart3, Users,
} from 'lucide-react'

/** Formato serializável de um plano vindo do servidor (planos_config). */
export type PlanData = {
  id: string
  name: string
  priceCents: number
  tagline: string
  features: string[]
  featured: boolean
}

/** Fallback caso o banco não responda — mantém a vitrine sempre preenchida. */
const FALLBACK_PLANS: PlanData[] = [
  { id: 'essencial', name: 'Essencial', priceCents: 4900, featured: false, tagline: 'Para quem está começando a organizar.', features: ['PDV integrado', 'Cadastro de clientes', 'Controle de estoque básico', '1 usuário'] },
  { id: 'profissional', name: 'Profissional', priceCents: 9900, featured: true, tagline: 'O favorito de quem quer crescer.', features: ['Pipeline de vendas', 'Atendimento multicanal', 'Relatórios em tempo real', 'Até 5 usuários'] },
  { id: 'escala', name: 'Escala', priceCents: 19900, featured: false, tagline: 'Para operações que não param.', features: ['Equipe ilimitada', 'Acesso via API', 'Suporte prioritário'] },
]

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const MODULES = [
  { icon: MessageSquare, title: 'Atendimento', desc: 'WhatsApp oficial, Instagram e chat num só painel, com distribuição automática.' },
  { icon: Workflow, title: 'Funil de vendas', desc: 'Cada lead vira card com próximo passo agendado e SLA de resposta.' },
  { icon: CreditCard, title: 'Cobrança & Pix', desc: 'Gere cobrança por Pix ou cartão dentro da conversa e concilie sozinho.' },
  { icon: Package, title: 'Estoque & PDV', desc: 'Venda no balcão ou online com estoque e caixa sincronizados em tempo real.' },
  { icon: CalendarDays, title: 'Agenda', desc: 'Visitas, consultas e test-drives com lembrete D-1 automático — menos faltas.' },
  { icon: Wallet, title: 'Financeiro', desc: 'Contas a pagar e receber, fluxo de caixa e DRE sem exportar pra planilha.' },
  { icon: BarChart3, title: 'Relatórios', desc: 'Receita, conversão e ticket médio atualizados a cada venda registrada.' },
  { icon: Users, title: 'Clientes', desc: 'Histórico completo de cada cliente para vender mais e no momento certo.' },
]

type CompareVal = boolean | 'meio'
const COMPARE: { label: string; nexus: CompareVal; planilha: CompareVal; generico: CompareVal }[] = [
  { label: 'Tudo num sistema só', nexus: true, planilha: false, generico: 'meio' },
  { label: 'WhatsApp oficial integrado', nexus: true, planilha: false, generico: false },
  { label: 'Fala a língua do seu segmento', nexus: true, planilha: 'meio', generico: false },
  { label: 'Cobrança por Pix nativa', nexus: true, planilha: false, generico: false },
  { label: 'Migração assistida', nexus: true, planilha: false, generico: 'meio' },
  { label: 'Preço em Real, suporte em português', nexus: true, planilha: true, generico: false },
]

const FAQ = [
  { q: 'Preciso de cartão de crédito para testar?', a: 'Não. O teste de 14 dias é liberado na hora, sem cartão. Você só escolhe um plano se decidir continuar.' },
  { q: 'Consigo migrar meus dados da planilha?', a: 'Sim. A migração é assistida: nosso time importa seus clientes, produtos e histórico para você começar já com tudo no lugar.' },
  { q: 'O WhatsApp é o oficial?', a: 'Sim, usamos a API oficial do WhatsApp (Meta). Sua conta fica segura e as conversas ficam registradas no funil.' },
  { q: 'Funciona para o meu segmento?', a: 'O Nexus se adapta a varejo, imobiliária, concessionária, saúde, food e serviços — com funil, campos e relatórios já no vocabulário da sua operação.' },
  { q: 'Posso cancelar quando quiser?', a: 'Pode. Sem fidelidade e sem multa. Você mantém o acesso até o fim do período já pago.' },
]

export default function Sections({ plans }: { plans?: PlanData[] }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const planList = plans && plans.length ? plans : FALLBACK_PLANS

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set('[data-rise]', { opacity: 1, y: 0 })
        gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((g) =>
          gsap.set(Array.from(g.children), { opacity: 1, y: 0 }))
        return
      }
      gsap.utils.toArray<HTMLElement>('[data-rise]').forEach((el) => {
        gsap.from(el, {
          y: 34, opacity: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        })
      })
      gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((grp) => {
        gsap.from(Array.from(grp.children), {
          y: 34, opacity: 0, duration: 0.8, stagger: 0.07, ease: 'power3.out',
          scrollTrigger: { trigger: grp, start: 'top 82%' },
        })
      })
    }, root)

    const refresh = () => ScrollTrigger.refresh()
    if (document.fonts?.ready) document.fonts.ready.then(refresh)
    window.addEventListener('load', refresh)
    return () => { window.removeEventListener('load', refresh); ctx.revert() }
  }, [])

  return (
    <div ref={rootRef}>
      {/* ---------- 4 · PROVA SOCIAL ---------- */}
      <div className="border-y border-line-soft bg-card py-[22px]">
        <div className="mx-auto flex max-w-[1080px] flex-wrap justify-center gap-x-11 gap-y-3 px-6 text-center text-[12.5px] font-medium text-ink-3">
          <span><b className="font-bold tabular-nums text-ink">247</b> empresas ativas</span>
          <span><b className="font-bold tabular-nums text-ink">31 mil</b> leads atendidos</span>
          <span><b className="font-bold tabular-nums text-ink">R$ 4,8 mi</b> vendidos por mês na plataforma</span>
          <span className="text-ink-2">WhatsApp oficial Meta</span>
          <span className="text-ink-2">Pix nativo</span>
        </div>
      </div>

      {/* ---------- 5 · FEATURE: O LEAD CHEGA ---------- */}
      <section className="mx-auto grid max-w-[1080px] grid-cols-1 items-center gap-[60px] px-6 py-[92px] lg:grid-cols-2 lg:gap-[60px]">
        <div data-rise>
          <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Atendimento que fecha venda</div>
          <h2 className="mb-3.5 mt-3 text-[clamp(26px,3.4vw,36px)] font-bold leading-[1.08] tracking-[-0.035em]">
            O lead chega. O sistema já sabe o que fazer.
          </h2>
          <p className="text-[16px] leading-relaxed text-ink-2">
            Cada contato do WhatsApp vira um card no funil, cai na distribuição automática da equipe e ganha um próximo passo agendado. Ninguém mais esquecido em conversa perdida.
          </p>
          <ul className="mt-5">
            {[
              'Resposta cronometrada por SLA — o gestor vê quem demora',
              'Cobrança por Pix e cartão dentro da conversa',
              'Follow-up automático quando o cliente some',
            ].map((li) => (
              <li key={li} className="flex gap-3 border-t border-line-soft py-3 text-[14.5px]">
                <Check size={18} className="mt-px shrink-0 text-ok" />
                {li}
              </li>
            ))}
          </ul>
        </div>

        <div data-rise className="rounded-card border border-line bg-card p-[22px] shadow-[0_1px_2px_rgba(21,24,28,.04)]">
          <div className="max-w-[86%] rounded-[10px_10px_10px_3px] bg-ink/[0.04] px-3.5 py-2.5 text-[13px]">
            Oi! Vocês têm o iPhone 15 de 128?
          </div>
          <div className="mx-1 mb-3 mt-0.5 text-[10.5px] font-medium text-ink-3">Larissa · via Instagram · 09:14</div>
          <div className="ml-auto max-w-[86%] rounded-[10px_10px_3px_10px] bg-ink px-3.5 py-2.5 text-[13px] text-white/90">
            Tenho sim, Larissa! Azul e preto em estoque. Te mando o link com frete grátis pra hoje?
          </div>
          <div className="mx-1 mb-3 mt-0.5 text-right text-[10.5px] font-medium text-ink-3">Rafael respondeu em 1min 52s</div>
          <div className="rounded-control border border-dashed border-accent/35 bg-accent-soft px-3 py-2 text-center text-[11px] font-semibold text-accent">
            Lead movido para Negociação · cobrança Pix de R$ 4.299 gerada
          </div>
        </div>
      </section>

      {/* ---------- 6 · MÓDULOS ---------- */}
      <section id="produto" className="scroll-mt-24 border-t border-line-soft bg-card py-[84px]">
        <div className="mx-auto max-w-[1080px] px-6">
          <div className="mb-11 max-w-[600px]" data-rise>
            <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Um núcleo, toda a operação</div>
            <h2 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-bold leading-[1.08] tracking-[-0.035em]">
              Os módulos que o seu segmento precisa — e só eles.
            </h2>
            <p className="mt-3.5 text-[16px] leading-relaxed text-ink-2">
              Do primeiro contato ao pós-venda, sem planilha solta nem sistema paralelo. Cada módulo já vem ajustado ao vocabulário da sua operação.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-stagger>
            {MODULES.map((m) => (
              <div key={m.title} className="rounded-card border border-line bg-bg p-5 transition-colors hover:border-ink/15">
                <span className="mb-3.5 grid h-9 w-9 place-items-center rounded-control bg-accent-soft text-accent">
                  <m.icon size={18} />
                </span>
                <h3 className="text-[15px] font-bold tracking-[-0.02em]">{m.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 7 · DEPOIMENTO ---------- */}
      <section className="mx-auto max-w-[1080px] px-6 py-[84px]">
        <figure data-rise className="mx-auto max-w-[820px] rounded-card border border-line bg-card p-8 sm:p-11">
          <blockquote className="text-[clamp(20px,2.6vw,27px)] font-semibold leading-[1.28] tracking-[-0.02em]">
            “Saímos de três planilhas e um caderno para um sistema só. Em dois meses o tempo de resposta no WhatsApp caiu para menos de 2 minutos e paramos de perder venda por esquecimento.”
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-[14px] font-bold text-white">J</span>
            <div>
              <div className="text-[14px] font-semibold">Matheus, JM Store</div>
              <div className="text-[12.5px] text-ink-3">Varejo de eletrônicos · cliente desde 2025</div>
            </div>
          </figcaption>
        </figure>
      </section>

      {/* ---------- 8 · COMPARATIVO HONESTO ---------- */}
      <section className="border-t border-line-soft bg-card py-[84px]">
        <div className="mx-auto max-w-[1080px] px-6">
          <div className="mb-9 max-w-[600px]" data-rise>
            <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Comparativo honesto</div>
            <h2 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-bold leading-[1.08] tracking-[-0.035em]">
              Onde o Nexus faz diferença — e onde não precisa.
            </h2>
          </div>

          <div className="overflow-x-auto" data-rise>
            <table className="w-full min-w-[560px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-3.5 pr-4 text-left font-medium text-ink-3"> </th>
                  <th className="w-[140px] py-3.5 text-center text-[14px] font-bold text-ink">Nexus</th>
                  <th className="w-[140px] py-3.5 text-center font-medium text-ink-2">Planilha</th>
                  <th className="w-[140px] py-3.5 text-center font-medium text-ink-2">CRM genérico</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label} className="border-b border-line-soft">
                    <td className="py-3.5 pr-4 text-ink-2">{row.label}</td>
                    <td className="py-3.5 text-center"><Mark v={row.nexus} /></td>
                    <td className="py-3.5 text-center"><Mark v={row.planilha} /></td>
                    <td className="py-3.5 text-center"><Mark v={row.generico} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------- 9 · PLANOS ---------- */}
      <section id="planos" className="mx-auto max-w-[1080px] scroll-mt-24 px-6 py-[84px]">
        <div className="mb-11 max-w-[600px]" data-rise>
          <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Planos</div>
          <h2 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-bold leading-[1.08] tracking-[-0.035em]">
            Preço honesto. Sem pegadinha.
          </h2>
          <p className="mt-3.5 text-[16px] leading-relaxed text-ink-2">Comece grátis por 14 dias. Cancele quando quiser.</p>
        </div>

        {planList.length === 0 ? (
          <p className="text-[15px] text-ink-2">
            Estamos atualizando nossos planos.{' '}
            <Link href="/register" className="font-semibold text-accent hover:underline">Fale com a gente</Link> para conhecer as opções.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-stagger>
            {planList.map((p) => (
              <div
                key={p.id}
                className={
                  'relative flex flex-col rounded-card border bg-card p-6 ' +
                  (p.featured ? 'border-accent shadow-[0_1px_2px_rgba(21,24,28,.04),0_20px_44px_-28px_rgba(46,92,230,.4)]' : 'border-line')
                }
              >
                {p.featured && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-white">
                    Mais popular
                  </span>
                )}
                <div className="text-[16px] font-bold tracking-[-0.02em]">{p.name}</div>
                {p.tagline && <div className="mt-1 text-[13px] text-ink-2">{p.tagline}</div>}
                <div className="mt-4 flex items-baseline gap-1">
                  {p.priceCents === 0 ? (
                    <span className="text-[32px] font-bold tracking-[-0.03em]">Grátis</span>
                  ) : (
                    <>
                      <span className="text-[15px] font-semibold text-ink-2">R$</span>
                      <span className="text-[34px] font-bold tracking-[-0.03em] tabular-nums">{formatPrice(p.priceCents)}</span>
                      <span className="text-[13px] font-medium text-ink-3">/mês</span>
                    </>
                  )}
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13.5px] text-ink-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-ok" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={
                    'mt-6 inline-flex items-center justify-center gap-2 rounded-control px-4 py-2.5 text-[13.5px] font-semibold transition-colors ' +
                    (p.featured ? 'bg-ink text-white hover:bg-ink/90' : 'border border-line bg-card text-ink hover:border-ink/20')
                  }
                >
                  Começar agora
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- 10 · FAQ ---------- */}
      <section className="border-t border-line-soft bg-card py-[84px]">
        <div className="mx-auto max-w-[760px] px-6">
          <div className="mb-9" data-rise>
            <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Perguntas frequentes</div>
            <h2 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-bold leading-[1.08] tracking-[-0.035em]">Ainda com dúvida?</h2>
          </div>
          <div data-rise className="rounded-card border border-line bg-bg">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-b border-line-soft last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-control border border-line text-ink-3 transition-transform group-open:rotate-45">
                    <Plus size={14} />
                  </span>
                </summary>
                <p className="px-5 pb-4 text-[14px] leading-relaxed text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 11 · CTA FINAL + FOOTER ---------- */}
      <section className="mx-auto max-w-[1080px] px-6 pb-[84px] pt-[84px]">
        <div data-rise className="rounded-card border border-line bg-card px-6 py-14 text-center sm:px-11">
          <h2 className="mx-auto max-w-[600px] text-[clamp(24px,3.4vw,34px)] font-bold tracking-[-0.035em]">
            Pronto para aposentar a planilha?
          </h2>
          <p className="mx-auto mb-7 mt-2.5 max-w-[440px] text-[16px] leading-relaxed text-ink-2">
            Escolha o seu segmento, conecte o WhatsApp e venda com processo ainda esta semana.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-[9px] bg-ink px-[22px] py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-ink/90">
              Criar minha conta
              <ArrowUpRight size={18} />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-[9px] border border-line bg-card px-[22px] py-3 text-[14.5px] font-semibold text-ink transition-colors hover:border-ink/20">
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 px-6 py-9 text-[12.5px] text-ink-3">
          <Link href="/" className="flex items-center" aria-label="Nexus">
            <Image src="/nexus-logo.png" alt="Nexus" width={42} height={28} className="h-[28px] w-auto" />
          </Link>
          <div className="flex items-center gap-5">
            <a href="#produto" className="transition-colors hover:text-ink">Produto</a>
            <a href="#planos" className="transition-colors hover:text-ink">Planos</a>
            <Link href="/login" className="transition-colors hover:text-ink">Entrar</Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">Privacidade</Link>
          </div>
          <div>Feito no Brasil · LGPD · © 2026 Nexus</div>
        </div>
      </footer>
    </div>
  )
}

/* marca de comparação: sim / não / parcial */
function Mark({ v }: { v: boolean | 'meio' }) {
  if (v === 'meio') return <Minus size={16} className="mx-auto text-warn" aria-label="parcial" />
  if (v) return <Check size={17} className="mx-auto text-ok" aria-label="sim" />
  return <X size={16} className="mx-auto text-ink-3" aria-label="não" />
}
