'use client'

/**
 * ComoFunciona — a transição do dark para o claro ("a luz acende": o produto
 * é claro). Três cards, um por passo: criar a conta, conectar os canais e
 * vender com processo (data.ts → PASSOS).
 */

import { PASSOS } from '../data'
import { useReveal } from '../hooks/useReveal'

export default function ComoFunciona() {
  const rootRef = useReveal<HTMLElement>()

  return (
    <section ref={rootRef} id="como-funciona" className="relative scroll-mt-24 overflow-hidden rounded-t-[28px] bg-bg pb-28 pt-32 text-ink shadow-[0_-40px_80px_-40px_rgba(46,92,230,.35)] sm:rounded-t-[40px]">
      {/* costura dark→light: a luz "acende" — brilho cobalto vazando na borda */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{ background: 'radial-gradient(64% 100% at 50% 0%, rgba(46,92,230,.16), transparent 68%)' }} />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-px w-[60%] -translate-x-1/2"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(46,92,230,.6), transparent)' }} />
      <div className="relative mx-auto max-w-[1120px] px-5 sm:px-6">
        <div data-rise className="mb-14 max-w-[640px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">Como funciona</div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">
            Da conta criada à primeira venda no funil.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
            Um CRM com WhatsApp, Instagram e automações para vender mais — sem planilha solta nem sistema paralelo.
          </p>
        </div>

        <div data-stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PASSOS.map((p) => (
            <div
              key={p.n}
              className="rounded-card border border-line bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_20px_48px_-24px_rgba(46,92,230,.35)]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-ink text-[13px] font-bold text-white">
                {p.n}
              </span>
              <h3 className="mt-5 text-[17px] font-bold tracking-[-0.02em]">{p.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{p.desc}</p>
              <div className="mt-4 text-[12px] font-semibold text-ink-3">{p.detalhe}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
