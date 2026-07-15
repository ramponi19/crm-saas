'use client'

/**
 * Landing — homepage pública do Nexus.
 *
 * Arquitetura: cada ato vive em `sections/`; o conteúdo em `data.ts`;
 * os efeitos globais (grain, auroras, marquee, spotlight) em `landing.css`.
 *
 * Dramaturgia: abre dark cinematográfico (hero + produto 3D + narrativa do
 * lead + módulos + números), a luz "acende" nos segmentos e seções de
 * decisão (planos, FAQ), e fecha dark no CTA final. Rolagem suave via Lenis,
 * animações GSAP com ScrollTrigger — tudo respeitando prefers-reduced-motion.
 *
 * A nav é fixa e troca de tema sozinha: fica clara enquanto a zona clara
 * (wrapper [data-nav-light]) cruza o topo da tela.
 */

import './landing.css'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useSmoothScroll } from './hooks/useSmoothScroll'
import type { PlanData } from './data'
import Hero from './sections/Hero'
import LeadStory from './sections/LeadStory'
import Modules from './sections/Modules'
import Segments from './sections/Segments'
import Testimonial from './sections/Testimonial'
import Compare from './sections/Compare'
import Plans from './sections/Plans'
import Faq from './sections/Faq'
import FinalCta from './sections/FinalCta'

export default function Landing({ plans }: { plans?: PlanData[] }) {
  useSmoothScroll()

  return (
    <div className="lp min-h-screen bg-[color:var(--lp-deep)] font-sans antialiased">
      <div className="lp-grain" aria-hidden />
      <Nav />
      <main>
        <Hero />
        <LeadStory />
        <Modules />
        {/* zona clara — a nav observa este wrapper para trocar de tema */}
        <div data-nav-light>
          <Segments />
          <Testimonial />
          <Compare />
          <Plans plans={plans} />
          <Faq />
        </div>
        <FinalCta />
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Nav fixa, theme-aware                                              */
/* ------------------------------------------------------------------ */

const NAV_LINKS: [string, string][] = [
  ['#segmentos', 'Produto'],
  ['#modulos', 'Módulos'],
  ['#planos', 'Planos'],
  ['#faq', 'FAQ'],
]

function Nav() {
  const navRef = useRef<HTMLElement>(null)
  const [light, setLight] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const zone = document.querySelector('[data-nav-light]')
    let st: ScrollTrigger | undefined
    if (zone) {
      st = ScrollTrigger.create({
        trigger: zone, start: 'top 68', end: 'bottom 68',
        onToggle: (self) => setLight(self.isActive),
      })
    }
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { st?.kill(); window.removeEventListener('scroll', onScroll) }
  }, [])

  return (
    <nav
      ref={navRef}
      className={
        'fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl transition-colors duration-500 ' +
        (light
          ? 'border-line-soft bg-bg/85 text-ink'
          : 'border-white/[0.07] text-white ' + (scrolled ? 'bg-[#0a0c10]/80' : 'bg-transparent'))
      }
    >
      <div className="mx-auto flex h-[64px] max-w-[1120px] items-center gap-8 px-5 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="Nexus">
          <Image
            src="/nexus-logo.png" alt="Nexus" width={66} height={44} priority
            className={'h-[42px] w-auto transition-[filter] duration-500 ' + (light ? '' : 'brightness-0 invert')}
          />
        </Link>
        <div className={'ml-2 hidden items-center gap-7 text-[13.5px] font-medium md:flex ' + (light ? 'text-ink-2' : 'text-white/60')}>
          {NAV_LINKS.map(([href, label]) => (
            <a key={href} href={href} className={'transition-colors ' + (light ? 'hover:text-ink' : 'hover:text-white')}>
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3.5">
          <Link
            href="/login"
            className={
              'hidden items-center gap-2 text-[13.5px] font-semibold transition-colors sm:inline-flex ' +
              (light ? 'text-ink-2 hover:text-ink' : 'text-white/60 hover:text-white')
            }
          >
            <LogIn size={15} />
            Entrar
          </Link>
          <Link
            href="/register"
            className={
              'inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-bold transition-all ' +
              (light
                ? 'bg-ink text-white hover:bg-ink/90'
                : 'bg-white text-ink hover:shadow-[0_0_28px_-6px_rgba(46,92,230,.8)]')
            }
          >
            Criar Conta
          </Link>
        </div>
      </div>
    </nav>
  )
}
