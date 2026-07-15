'use client'

/**
 * Hero — abertura dark cinematográfica.
 *
 * Headline gigante com reveal mascarado linha a linha (SplitText — grátis
 * desde o GSAP 3.13), auroras cobalto flutuando ao fundo, malha sutil,
 * CTAs magnéticos. Abaixo, o <ProductStage/> em perspectiva 3D.
 * Reduced-motion: tudo estático e visível.
 */

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowDown } from 'lucide-react'
import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useMagnetic } from '../hooks/useMagnetic'
import ProductStage from './ProductStage'

export default function Hero() {
  const rootRef = useRef<HTMLElement>(null)
  const h1Ref = useRef<HTMLHeadingElement>(null)
  const cta1 = useMagnetic<HTMLAnchorElement>(0.24)
  const cta2 = useMagnetic<HTMLAnchorElement>(0.2)

  useEffect(() => {
    const root = rootRef.current
    const h1 = h1Ref.current
    if (!root || !h1) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce) {
      root.querySelectorAll<HTMLElement>('[data-hero]').forEach((el) => {
        el.style.opacity = '1'
        el.style.transform = 'none'
      })
      return
    }

    gsap.registerPlugin(SplitText)
    let split: SplitText | undefined
    const ctx = gsap.context(() => {
      // auroras — deriva lenta, contínua
      gsap.to('[data-aurora="1"]', { x: 90, y: 50, duration: 11, ease: 'sine.inOut', repeat: -1, yoyo: true })
      gsap.to('[data-aurora="2"]', { x: -70, y: -40, duration: 14, ease: 'sine.inOut', repeat: -1, yoyo: true })
    }, root)

    // o SplitText espera as fontes p/ quebrar as linhas no lugar certo
    let cancelled = false
    // Failsafe: se SplitText/plugin/fonts falharem, a headline NUNCA fica invisível.
    const failsafe = setTimeout(() => { gsap.set(h1, { opacity: 1 }) }, 1400)
    const ready = document.fonts?.ready ?? Promise.resolve()
    ready.then(() => {
      if (cancelled) return
      ctx.add(() => {
        gsap.set(h1, { opacity: 1 }) // visível ANTES de tentar o split
        try {
          split = new SplitText(h1, { type: 'lines', mask: 'lines', linesClass: 'lp-line' })
          const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
          tl.from(split.lines, { yPercent: 112, duration: 1.15, stagger: 0.11 }, 0.05)
            .from('[data-hero]', { y: 22, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' }, 0.45)
        } catch {
          // SplitText indisponível → mostra tudo, sem a animação de linhas
          gsap.set('[data-hero]', { opacity: 1, y: 0 })
        }
      })
    })

    return () => { cancelled = true; clearTimeout(failsafe); split?.revert(); ctx.revert() }
  }, [])

  return (
    <section ref={rootRef} className="relative overflow-hidden bg-[color:var(--lp-deep)] pb-16 pt-[112px] text-[color:var(--lp-white)] sm:pt-[128px]">
      {/* fundo: auroras */}
      <div aria-hidden data-aurora="1" className="lp-aurora left-[8%] top-[-160px] h-[430px] w-[560px] opacity-[0.55]"
        style={{ background: 'radial-gradient(closest-side, rgba(46,92,230,.5), transparent 72%)' }} />
      <div aria-hidden data-aurora="2" className="lp-aurora right-[4%] top-[40px] h-[380px] w-[460px] opacity-[0.35]"
        style={{ background: 'radial-gradient(closest-side, rgba(110,143,240,.42), transparent 72%)' }} />

      <div className="relative mx-auto max-w-[1120px] px-5 text-center sm:px-6">
        {/* eyebrow */}
        <div data-hero className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[color:var(--lp-border)] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-[color:var(--lp-dim)] backdrop-blur-sm">
          <span className="lp-live-dot h-[7px] w-[7px] rounded-full bg-ok" />
          WhatsApp oficial Meta · Pix nativo · feito no Brasil
        </div>

        {/* headline — opacity 0 até o SplitText montar (evita salto de linha visível) */}
        <h1
          ref={h1Ref}
          className="mx-auto max-w-[900px] text-[clamp(44px,7.6vw,96px)] font-extrabold leading-[0.99] tracking-[-0.045em]"
          style={{ opacity: 0 }}
        >
          Venda com processo.{' '}
          <span className="lp-text-glow">Cresça com controle.</span>
        </h1>

        <p data-hero className="mx-auto mt-6 max-w-[580px] text-[17px] leading-relaxed text-[color:var(--lp-dim)] sm:text-[18.5px]">
          Leads do WhatsApp, vendas com Pix, estoque, agenda e financeiro num sistema só — que fala a língua do seu segmento.
        </p>

        {/* CTAs magnéticos */}
        <div data-hero className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            ref={cta1.ref}
            href="/register"
            className="inline-flex items-center gap-2 rounded-[11px] bg-white px-7 py-[15px] text-[15px] font-bold text-ink shadow-[0_0_40px_-8px_rgba(46,92,230,.6)] transition-shadow hover:shadow-[0_0_56px_-6px_rgba(46,92,230,.85)]"
          >
            Começar grátis por 14 dias
          </Link>
          <a
            ref={cta2.ref}
            href="#segmentos"
            className="inline-flex items-center gap-2 rounded-[11px] border border-[color:var(--lp-border)] bg-white/[0.04] px-7 py-[15px] text-[15px] font-semibold text-[color:var(--lp-white)] backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.07]"
          >
            Ver o produto
            <ArrowDown size={16} className="opacity-70" />
          </a>
        </div>

        <div data-hero className="mt-5 text-[12.5px] text-[color:var(--lp-faint)]">
          Sem cartão de crédito · migração assistida · <b className="font-semibold text-[color:var(--lp-dim)]">configuração em 10 minutos</b>
        </div>
      </div>

      {/* palco 3D do produto — puxado pra dentro da dobra (co-protagonista) */}
      <div data-hero className="mt-9 sm:mt-11">
        <ProductStage />
      </div>
    </section>
  )
}
