'use client'

/**
 * FinalCta — fechamento dark: tipografia gigante, glow cobalto e botão
 * magnético XL. Abaixo, o footer completo (produto, segmentos, conta, legal).
 */

import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SEG_CARDS, SEGS } from '../data'
import { useMagnetic } from '../hooks/useMagnetic'
import { useReveal } from '../hooks/useReveal'

export default function FinalCta() {
  const rootRef = useReveal<HTMLElement>()
  const cta = useMagnetic<HTMLAnchorElement>(0.26)

  return (
    <section ref={rootRef} className="relative overflow-hidden bg-[color:var(--lp-deep)] text-[color:var(--lp-white)]">
      <div aria-hidden className="lp-aurora left-1/2 top-[-120px] h-[440px] w-[640px] -translate-x-1/2 opacity-[0.4]"
        style={{ background: 'radial-gradient(closest-side, rgba(46,92,230,.5), transparent 72%)' }} />

      <div className="relative mx-auto max-w-[1120px] px-5 pb-24 pt-32 text-center sm:px-6">
        <h2 data-rise className="mx-auto max-w-[760px] text-[clamp(38px,6vw,72px)] font-extrabold leading-[1.0] tracking-[-0.045em]">
          Pronto para aposentar <span className="lp-text-glow">a planilha?</span>
        </h2>
        <p data-rise className="mx-auto mt-6 max-w-[460px] text-[16.5px] leading-relaxed text-[color:var(--lp-dim)]">
          Escolha o seu segmento, conecte o WhatsApp e venda com processo ainda esta semana.
        </p>
        <div data-rise className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            ref={cta.ref}
            href="/register"
            className="inline-flex items-center gap-2.5 rounded-[12px] bg-white px-9 py-[18px] text-[16px] font-bold text-ink shadow-[0_0_48px_-8px_rgba(46,92,230,.7)] transition-shadow hover:shadow-[0_0_64px_-4px_rgba(46,92,230,.95)]"
          >
            Criar minha conta
            <ArrowUpRight size={18} />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--lp-border)] bg-white/[0.04] px-8 py-[18px] text-[15px] font-semibold transition-colors hover:border-white/25 hover:bg-white/[0.07]"
          >
            Já tenho conta
          </Link>
        </div>
        <div data-rise className="mt-6 text-[12.5px] text-[color:var(--lp-faint)]">
          14 dias grátis · sem cartão de crédito · sem fidelidade
        </div>
      </div>

      {/* ---------- footer ---------- */}
      <footer className="relative border-t border-[color:var(--lp-border-soft)]">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-6">
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <Image
                src="/nexus-logo.png" alt="Nexus" width={66} height={44}
                className="h-[40px] w-auto brightness-0 invert"
              />
              <p className="mt-4 max-w-[220px] text-[12.5px] leading-relaxed text-[color:var(--lp-faint)]">
                CRM + operação para o comércio brasileiro. Feito no Brasil, em conformidade com a LGPD.
              </p>
            </div>
            <FooterCol title="Produto" links={[
              ['#segmentos', 'Ver o produto'],
              ['#modulos', 'Módulos'],
              ['#planos', 'Planos'],
              ['#faq', 'Perguntas frequentes'],
            ]} />
            <FooterCol title="Segmentos" links={SEG_CARDS.map((c) => [`/para/${SEGS[c.key].para}`, c.title] as [string, string])} />
            <FooterCol title="Conta" links={[
              ['/register', 'Testar grátis'],
              ['/login', 'Entrar'],
              ['/privacy', 'Privacidade'],
            ]} />
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--lp-border-soft)] pt-7 text-[12px] text-[color:var(--lp-faint)]">
            <span>© 2026 Nexus · todos os direitos reservados</span>
            <span>WhatsApp oficial Meta · Pix nativo · LGPD</span>
          </div>
        </div>
      </footer>
    </section>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-[color:var(--lp-faint)]">{title}</div>
      <ul className="mt-4 space-y-2.5">
        {links.map(([href, label]) => (
          <li key={href + label}>
            {href.startsWith('#') ? (
              <a href={href} className="text-[13.5px] text-[color:var(--lp-dim)] transition-colors hover:text-white">{label}</a>
            ) : (
              <Link href={href} className="text-[13.5px] text-[color:var(--lp-dim)] transition-colors hover:text-white">{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
