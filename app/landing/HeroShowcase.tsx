'use client'

/**
 * HeroShowcase — o "produto vivo" do hero.
 *
 * Cards de vidro (glassmorphism) flutuando em profundidade 3D: um gráfico de
 * receita que se desenha sozinho, números que sobem contando, um lead chegando
 * e a taxa de conversão com anel animado. Parallax 3D com o mouse.
 * Tudo em CSS/SVG + GSAP — sem WebGL. Respeita prefers-reduced-motion.
 */

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { TrendingUp, UserPlus, Target, ShoppingBag } from 'lucide-react'
import styles from './Landing.module.css'

export default function HeroShowcase() {
  const stageRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<SVGPathElement>(null)
  const areaRef = useRef<SVGPathElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const revenueRef = useRef<HTMLSpanElement>(null)
  const convRef = useRef<HTMLSpanElement>(null)
  const salesRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const fmt = (v: number) => Math.round(v).toLocaleString('pt-BR')
    const countTo = (
      el: HTMLElement | null,
      end: number,
      prefix = '',
      suffix = '',
    ) => {
      if (!el) return
      if (reduce) { el.textContent = `${prefix}${fmt(end)}${suffix}`; return }
      const obj = { v: 0 }
      gsap.to(obj, {
        v: end, duration: 1.8, delay: 0.7, ease: 'power2.out',
        onUpdate: () => { el.textContent = `${prefix}${fmt(obj.v)}${suffix}` },
      })
    }

    const ctx = gsap.context(() => {
      // entrada dos cards
      if (!reduce) {
        gsap.from(`.${styles.card}`, {
          y: 46, opacity: 0, scale: 0.94, filter: 'blur(6px)',
          duration: 1.1, stagger: 0.13, ease: 'power4.out', delay: 0.25,
        })
      }

      // linha do gráfico se desenhando
      const line = lineRef.current
      if (line) {
        const len = line.getTotalLength()
        gsap.set(line, { strokeDasharray: len, strokeDashoffset: reduce ? 0 : len })
        if (!reduce) gsap.to(line, { strokeDashoffset: 0, duration: 1.9, ease: 'power2.inOut', delay: 0.55 })
      }
      // área preenchendo
      if (areaRef.current) {
        gsap.set(areaRef.current, { opacity: reduce ? 1 : 0 })
        if (!reduce) gsap.to(areaRef.current, { opacity: 1, duration: 1.2, ease: 'power2.out', delay: 1.1 })
      }
      // anel de conversão
      const ring = ringRef.current
      if (ring) {
        const c = 2 * Math.PI * 26
        const pct = 0.38
        gsap.set(ring, { strokeDasharray: c, strokeDashoffset: reduce ? c * (1 - pct) : c })
        if (!reduce) gsap.to(ring, { strokeDashoffset: c * (1 - pct), duration: 1.6, ease: 'power2.inOut', delay: 0.9 })
      }

      // contadores
      countTo(revenueRef.current, 128480, 'R$ ')
      countTo(convRef.current, 38, '', '%')
      countTo(salesRef.current, 342)

      // float sutil e contínuo (via GSAP p/ preservar o translateZ de cada card)
      if (!reduce) {
        gsap.utils.toArray<HTMLElement>(`.${styles.card}`).forEach((el, i) => {
          gsap.to(el, {
            y: '-=12', duration: 3 + i * 0.5, ease: 'sine.inOut',
            repeat: -1, yoyo: true, delay: 1.3 + i * 0.15,
          })
        })
      }
    }, stage)

    // parallax 3D com o mouse
    let cleanupParallax = () => {}
    if (!reduce) {
      const rotX = gsap.quickTo(stage, 'rotationX', { duration: 0.7, ease: 'power3.out' })
      const rotY = gsap.quickTo(stage, 'rotationY', { duration: 0.7, ease: 'power3.out' })
      const onMove = (e: MouseEvent) => {
        const r = stage.getBoundingClientRect()
        const px = (e.clientX - (r.left + r.width / 2)) / r.width
        const py = (e.clientY - (r.top + r.height / 2)) / r.height
        rotY(px * 11)
        rotX(-py * 9)
      }
      window.addEventListener('mousemove', onMove)
      cleanupParallax = () => window.removeEventListener('mousemove', onMove)
    }

    return () => { ctx.revert(); cleanupParallax() }
  }, [])

  return (
    <div className={styles.showcase}>
      <div className={styles.showcaseGlow} />
      <div className={styles.showcaseRing} />
      <div className={styles.stage} ref={stageRef}>

        {/* ---- card principal: receita ---- */}
        <div className={`${styles.card} ${styles.cardMain}`}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadLeft}>
              <span className={styles.cardIcon}><TrendingUp size={15} /></span>
              <div>
                <div className={styles.cardTitle}>Receita</div>
                <div className={styles.cardSub}>últimos 30 dias</div>
              </div>
            </div>
            <span className={styles.livePill}><i /> ao vivo</span>
          </div>

          <div className={styles.metricRow}>
            <span className={styles.metricBig} ref={revenueRef}>R$ 0</span>
            <span className={styles.metricDelta}>+12,4%</span>
          </div>

          <svg className={styles.chart} viewBox="0 0 320 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C6A86A" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#C6A86A" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              ref={areaRef}
              d="M0,96 C30,88 45,70 70,72 C95,74 112,50 140,49 C168,48 186,60 210,45 C236,29 250,20 286,16 C300,14 312,12 320,11 L320,120 L0,120 Z"
              fill="url(#areaFill)"
            />
            <path
              ref={lineRef}
              d="M0,96 C30,88 45,70 70,72 C95,74 112,50 140,49 C168,48 186,60 210,45 C236,29 250,20 286,16 C300,14 312,12 320,11"
              fill="none" stroke="#C6A86A" strokeWidth="2.4" strokeLinecap="round"
            />
          </svg>
        </div>

        {/* ---- card: novo lead ---- */}
        <div className={`${styles.card} ${styles.cardLead}`}>
          <span className={styles.leadAvatar}><UserPlus size={15} /></span>
          <div className={styles.leadBody}>
            <div className={styles.leadTop}>Novo lead capturado</div>
            <div className={styles.leadSub}>Marina Costa · há 2 min</div>
          </div>
        </div>

        {/* ---- card: conversão (anel) ---- */}
        <div className={`${styles.card} ${styles.cardKpi}`}>
          <div className={styles.ringWrap}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(22,35,50,.10)" strokeWidth="6" />
              <circle
                ref={ringRef}
                cx="32" cy="32" r="26" fill="none" stroke="#2dd4bf" strokeWidth="6"
                strokeLinecap="round" transform="rotate(-90 32 32)"
              />
            </svg>
            <span className={styles.ringLabel}><Target size={14} /></span>
          </div>
          <div>
            <div className={styles.kpiValue}><span ref={convRef}>0%</span></div>
            <div className={styles.kpiLabel}>Taxa de conversão</div>
          </div>
        </div>

        {/* ---- card: vendas hoje ---- */}
        <div className={`${styles.card} ${styles.cardSales}`}>
          <span className={styles.cardIcon}><ShoppingBag size={15} /></span>
          <div>
            <div className={styles.salesValue}><span ref={salesRef}>0</span></div>
            <div className={styles.kpiLabel}>Vendas hoje</div>
          </div>
        </div>

      </div>
    </div>
  )
}
