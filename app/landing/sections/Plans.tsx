'use client'

/**
 * Plans — vitrine de planos (dados reais de planos_config via servidor;
 * fallback embutido). O plano em destaque ganha anel cobalto, glow e
 * leve escala no desktop.
 */

import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { FALLBACK_PLANS, formatPrice, type PlanData } from '../data'
import { useReveal } from '../hooks/useReveal'

export default function Plans({ plans }: { plans?: PlanData[] }) {
  const rootRef = useReveal<HTMLElement>()
  const planList = plans && plans.length ? plans : FALLBACK_PLANS

  return (
    <section ref={rootRef} id="planos" className="scroll-mt-24 bg-bg py-28 text-ink">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-6">
        <div data-rise className="mb-14 max-w-[600px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">Planos</div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">
            Preço honesto. Sem pegadinha.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-2">Comece grátis por 14 dias. Cancele quando quiser.</p>
        </div>

        {planList.length === 0 ? (
          <p className="text-[15px] text-ink-2">
            Estamos atualizando nossos planos.{' '}
            <Link href="/register" className="font-semibold text-accent hover:underline">Fale com a gente</Link> para conhecer as opções.
          </p>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-3" data-stagger>
            {planList.map((p) => (
              <div
                key={p.id}
                className={
                  'relative flex flex-col rounded-[16px] border bg-card p-7 transition-shadow duration-300 ' +
                  (p.featured
                    ? 'border-accent shadow-[0_1px_2px_rgba(21,24,28,.04),0_32px_64px_-32px_rgba(46,92,230,.55)] md:-my-3 md:py-10'
                    : 'border-line hover:shadow-[0_16px_40px_-24px_rgba(21,24,28,.25)]')
                }
              >
                {p.featured && (
                  <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-white">
                    Mais popular
                  </span>
                )}
                <div className="text-[17px] font-bold tracking-[-0.02em]">{p.name}</div>
                {p.tagline && <div className="mt-1 text-[13.5px] text-ink-2">{p.tagline}</div>}
                <div className="mt-5 flex items-baseline gap-1">
                  {p.priceCents === 0 ? (
                    <span className="text-[36px] font-extrabold tracking-[-0.03em]">Grátis</span>
                  ) : (
                    <>
                      <span className="text-[15px] font-semibold text-ink-2">R$</span>
                      <span className="text-[38px] font-extrabold tracking-[-0.035em] tabular-nums">{formatPrice(p.priceCents)}</span>
                      <span className="text-[13.5px] font-medium text-ink-3">/mês</span>
                    </>
                  )}
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[14px] text-ink-2">
                      <Check size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-accent" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={
                    'mt-7 inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[14px] font-bold transition-all ' +
                    (p.featured
                      ? 'bg-ink text-white hover:bg-ink/90 hover:shadow-[0_12px_28px_-12px_rgba(21,24,28,.5)]'
                      : 'border border-line bg-card text-ink hover:border-ink/25')
                  }
                >
                  Começar agora
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
