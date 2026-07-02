'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogIn, ArrowUpRight } from 'lucide-react'
import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'
import styles from './Landing.module.css'
import { useSmoothScroll } from './hooks/useSmoothScroll'
import HeroShowcase from './HeroShowcase'
import Sections, { type PlanData } from './Sections'

export default function Landing({ plans }: { plans?: PlanData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // smooth scroll cinematográfico (Lenis + GSAP ticker)
  useSmoothScroll()

  /* ------------------------------------------------------------------ */
  /*  Canvas ambiente — linhas de fluxo de dados (fundo)                */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let t = 0, raf = 0
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    const lines = 6
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height)
      for (let i = 0; i < lines; i++) {
        ctx.beginPath()
        const amp = 16 + i * 9
        const yBase = cv.height * (0.30 + i * 0.11)
        for (let x = 0; x <= cv.width; x += 8) {
          const y = yBase
            + Math.sin(x * 0.0055 + t * 0.012 + i * 0.85) * amp
            + Math.sin(x * 0.013 + t * 0.008) * amp * 0.4
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(198,168,106,${0.07 + i * 0.028})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      t++
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  /* ------------------------------------------------------------------ */
  /*  Grid prismático interativo — brilho de luz que segue o mouse      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (!window.matchMedia('(hover: hover)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const onMove = (e: MouseEvent) => {
      // atualiza a máscara do grid luminoso que segue o cursor (refração de luz)
      root.style.setProperty('--mx', `${e.clientX}px`)
      root.style.setProperty('--my', `${e.clientY}px`)
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  /* ------------------------------------------------------------------ */
  /*  Timeline de entrada (stagger cinematográfico)                     */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cancelled = false
    let split: SplitText | null = null

    const build = () => {
      if (cancelled) return
      gsap.registerPlugin(SplitText)

      const ctx = gsap.context(() => {
        const h1 = root.querySelector<HTMLElement>(`.${styles.h1}`)

        if (reduce) {
          gsap.set(`[data-reveal]`, { opacity: 1, y: 0 })
          return
        }

        split = h1 ? new SplitText(h1, { type: 'lines', mask: 'lines', linesClass: 'lineChild' }) : null

        const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })

        if (split) {
          tl.from(split.lines, {
            yPercent: 115, opacity: 0, duration: 1.25, stagger: 0.12,
          })
        }

        tl.from('[data-reveal="lede"]', { y: 24, opacity: 0, duration: 1.1 }, split ? '-=0.7' : 0)
          // anima o CONTAINER dos CTAs (não cada botão) — o transform dos botões
          // fica sob controle exclusivo do hook magnético, sem conflito.
          .from('[data-reveal="cta"]', { y: 22, opacity: 0, duration: 1 }, '-=0.85')
          .from('[data-reveal="eagle"]', { opacity: 0, scale: 0.92, duration: 1.6, ease: 'power3.out' }, '-=1.4')
      }, root)

      // guarda o revert para cleanup
      cleanup = () => { split?.revert(); ctx.revert() }
    }

    let cleanup = () => {}
    // espera as fontes carregarem para o SplitText quebrar as linhas certo
    if (document.fonts?.ready) {
      document.fonts.ready.then(build)
    } else {
      build()
    }

    return () => { cancelled = true; cleanup() }
  }, [])

  const logoSrc = '/eagle-navy.png'

  return (
    <div className={styles.page} ref={rootRef}>
      <div className={styles.grain} />
      <div className={styles.gridGlow} />
      {/* fundo do hero, contido na primeira dobra */}
      <div className={styles.heroBg}>
        <div className={styles.blobGold} />
        <div className={styles.blobNavy} />
        <div className={styles.grid} />
        <canvas ref={canvasRef} className={styles.flow} />
      </div>

      {/* nav */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <Image src={logoSrc} alt="" width={68} height={49} className={styles.brandMark} priority />
          <span className={styles.brandName}>ÁPICE</span>
          <span className={styles.brandReg}>®</span>
        </Link>
        <div className={styles.navRight}>
          <div className={styles.navLinks}>
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#planos">Planos</a>
            <a href="#para-quem">Para quem é</a>
            <a href="#contato">Contato</a>
          </div>
          <Link href="/login" className={styles.loginBtn}>
            <LogIn size={16} />
            Entrar
          </Link>
        </div>
      </nav>

      {/* hero */}
      <div className={styles.hero}>
        <div className={styles.copy}>
          <h1 className={styles.h1}>
            O CRM do empreendedor <em>está aqui.</em>
          </h1>
          <p className={styles.lede} data-reveal="lede">
            Vendas, atendimento e operação num só núcleo. Menos improviso, mais
            decisão — para quem leva o próprio negócio a sério.
          </p>
          <div className={styles.ctaRow} data-reveal="cta">
            <Link href="/register" className={styles.btnPrimary}>
              <span className={styles.btnShine} aria-hidden />
              <span className={styles.btnLabel}>
                Se cadastre aqui
                <ArrowUpRight size={18} />
              </span>
            </Link>
            <a href="#funcionalidades" className={styles.btnGhost}>
              <span className={styles.btnLabel}>Ver funcionalidades</span>
            </a>
          </div>
        </div>

        <div className={styles.heroRight} data-reveal="eagle">
          <HeroShowcase />
        </div>
      </div>

      {/* marquee */}
      <div className={styles.marquee}>
        <div className={styles.marqueeTrack}>
          {[0, 1].map((k) => (
            <div className={styles.marqueeGroup} key={k} aria-hidden={k === 1}>
              <span>PDV INTEGRADO</span><i>◆</i>
              <span>PIPELINE DE VENDAS</span><i>◆</i>
              <span>ATENDIMENTO MULTICANAL</span><i>◆</i>
              <span>CONTROLE DE ESTOQUE</span><i>◆</i>
              <span>RELATÓRIOS EM TEMPO REAL</span><i>◆</i>
            </div>
          ))}
        </div>
      </div>

      {/* seções abaixo do hero */}
      <Sections plans={plans} />
    </div>
  )
}
