'use client'

/**
 * Plans — o plano único (18/11/2026: plano único + módulos). Mostra o primeiro
 * plano ativo com preço de planos_config (lido no servidor, app/page.tsx) ou o
 * fallback embutido; sempre com "14 dias grátis, sem cartão" e "Módulos extras
 * na Central". O card mantém o anel cobalto e o glow do antigo destaque.
 */

import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { FALLBACK_PLAN, PLANO_EXTRAS, PLANO_TESTE, formatPrice, type PlanData } from '../data'
import { useReveal } from '../hooks/useReveal'

export default function Plans({ plans }: { plans?: PlanData[] }) {
  const rootRef = useReveal<HTMLElement>()
  const p = plans?.[0] ?? FALLBACK_PLAN

  return (
    <section ref={rootRef} id="planos" className="scroll-mt-24 bg-bg py-28 text-ink">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-6">
        <div data-rise className="mb-14 max-w-[600px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">Plano</div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">
            Um plano. Sem pegadinha.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-2">Tudo para vender pelo WhatsApp e pelo Instagram. Cancele quando quiser.</p>
        </div>

        <div className="mx-auto grid max-w-[460px] grid-cols-1 items-stretch gap-5" data-stagger>
          <div className="relative flex flex-col rounded-[16px] border border-accent bg-card p-7 shadow-[0_1px_2px_rgba(21,24,28,.04),0_32px_64px_-32px_rgba(46,92,230,.55)] transition-shadow duration-300 md:py-10">
            <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-white">
              {PLANO_TESTE}
            </span>
            <div className="text-[17px] font-bold tracking-[-0.02em]">{p.name}</div>
            {p.tagline && <div className="mt-1 text-[13.5px] text-ink-2">{p.tagline}</div>}
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-[15px] font-semibold text-ink-2">R$</span>
              <span className="text-[38px] font-extrabold tracking-[-0.035em] tabular-nums">{formatPrice(p.priceCents)}</span>
              <span className="text-[13.5px] font-medium text-ink-3">/mês</span>
            </div>
            <ul className="mt-6 flex-1 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[14px] text-ink-2">
                  <Check size={16} strokeWidth={2.6} className="mt-0.5 shrink-0 text-accent" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6 border-t border-line-soft pt-5 text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">{PLANO_EXTRAS}</span> — PDV, estoque, financeiro e outros, quando você precisar.
            </div>
            <Link
              href="/register"
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-[10px] bg-ink px-4 py-3 text-[14px] font-bold text-white transition-all hover:bg-ink/90 hover:shadow-[0_12px_28px_-12px_rgba(21,24,28,.5)]"
            >
              Começar 14 dias grátis
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
