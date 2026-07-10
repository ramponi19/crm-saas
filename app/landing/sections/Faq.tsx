'use client'

/**
 * Faq — accordion nativo (<details>, acessível e funciona sem JS),
 * com o ícone girando ao abrir.
 */

import { Plus } from 'lucide-react'
import { FAQ } from '../data'
import { useReveal } from '../hooks/useReveal'

export default function Faq() {
  const rootRef = useReveal<HTMLElement>()

  return (
    <section ref={rootRef} id="faq" className="scroll-mt-24 border-t border-line-soft bg-card py-28 text-ink">
      <div className="mx-auto max-w-[780px] px-5 sm:px-6">
        <div className="mb-10" data-rise>
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">Perguntas frequentes</div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">Ainda com dúvida?</h2>
        </div>
        <div data-rise className="overflow-hidden rounded-[16px] border border-line bg-bg">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-b border-line-soft last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15.5px] font-semibold transition-colors hover:bg-ink/[0.02] marker:hidden [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-ink-3 transition-transform duration-300 group-open:rotate-45 group-open:border-accent group-open:text-accent">
                  <Plus size={15} />
                </span>
              </summary>
              <p className="px-6 pb-5 text-[14.5px] leading-relaxed text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
