'use client'

/**
 * Segments — a transição do dark para o claro ("a luz acende": o produto
 * é claro). Seis cards, um por segmento, linkando as páginas SEO /para/*.
 */

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SEGS, SEG_CARDS } from '../data'
import { useReveal } from '../hooks/useReveal'

export default function Segments() {
  const rootRef = useReveal<HTMLElement>()

  return (
    <section ref={rootRef} className="relative overflow-hidden rounded-t-[28px] bg-bg pb-28 pt-32 text-ink shadow-[0_-40px_80px_-40px_rgba(46,92,230,.35)] sm:rounded-t-[40px]">
      {/* costura dark→light: a luz "acende" — brilho cobalto vazando na borda */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{ background: 'radial-gradient(64% 100% at 50% 0%, rgba(46,92,230,.16), transparent 68%)' }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-px w-[60%] -translate-x-1/2"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(46,92,230,.6), transparent)' }} />
      <div className="relative mx-auto max-w-[1120px] px-5 sm:px-6">
        <div data-rise className="mb-14 max-w-[640px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">Seis segmentos, um sistema</div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">
            Escolha o seu. O Nexus já chega falando a sua língua.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
            Funil, campos, relatórios e menu nascem no vocabulário da sua operação — visita, test-drive, consulta, comanda ou OS.
          </p>
        </div>

        <div data-stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SEG_CARDS.map((c) => {
            const seg = SEGS[c.key]
            return (
              <Link
                key={c.key}
                href={`/para/${seg.para}`}
                className="group rounded-card border border-line bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_20px_48px_-24px_rgba(46,92,230,.35)]"
              >
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-ink text-[13px] font-bold text-white">
                    {seg.inicial}
                  </span>
                  <ArrowUpRight size={18} className="text-ink-3 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
                </div>
                <h3 className="mt-5 text-[17px] font-bold tracking-[-0.02em]">{c.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{c.desc}</p>
                <div className="mt-4 text-[12px] font-semibold text-ink-3">
                  Funil: {seg.cols.map((col) => col.name).slice(0, 3).join(' → ')} …
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
